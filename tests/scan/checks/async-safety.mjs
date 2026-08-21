/**
 * Promises nobody is waiting for, and errors nobody will ever see.
 *
 * Two failures, one traversal, because both are facts about the same AST and
 * building the program twice costs a minute.
 *
 * **`scan.floating-promise`.** An async call used as a statement. The work is
 * still scheduled — but on the server the request has already been answered by
 * the time it settles, so a rejection has nowhere to go except Node's
 * `unhandledRejection`, and the write it was carrying is simply gone. Nobody
 * sees a 500, because there was no 500 to see.
 *
 * The detection is type-based on purpose. A name heuristic ("the identifier
 * looks async") mislabels both directions: `refreshDefaulterRecoveryState`
 * reads async and might not be, and `run()` reads sync and is. So the check
 * asks the checker what the expression *is* — a type carrying a callable
 * `then` member — which is also the only way to catch a thenable that is not
 * literally a `Promise`.
 *
 * Three things look like a floating promise and are not, and all three are
 * idioms this repo actually uses:
 *
 *   void recordActivity({ … });                 // 24 of these, deliberate
 *   previewRowsPromise.catch(() => {});          // rejection already owned
 *   loadDraft({ … }).then((draft) => { … });     // a handler is attached
 *
 * `void` is the whole point: it is how a reader says "I know, and I mean it".
 * A rule that flagged it would be arguing with the codebase's own convention
 * and would be muted within a week.
 *
 * **The scope is server code — `src/app/` and `src/lib/`, minus anything a client
 * bundle can reach.** That is not a convenience narrowing; it is what the rule
 * says. In a browser an unhandled rejection lands in the console of the person
 * who can see the screen. On the server it lands after the response, in a
 * region log, attached to a request that already returned 200. Widening to
 * `src/components/` was tried and produced eleven findings, every one of them a
 * call into a local helper whose body is wholly wrapped in try/catch/finally
 * and therefore cannot reject at all — `fetchData` in the transactions shell,
 * `runSupportAction` in Fee Setup. Eleven false positives is how a P1 rule
 * gets ignored. The client surface is left to the checks that own it.
 *
 * **`scan.error-swallowed`.** `catch {}` with nothing in it. The distinction
 * that matters here is the one between an omission and a decision:
 *
 *   } catch {}                                   // finding
 *   } catch {
 *     // A torn record from an interrupted run. Skipped, not fatal.
 *   }                                            // not a finding
 *
 * The second form is `tests/deep/lib/stream.ts`, and there are 43 more like it
 * in this repo against 4 of the first. A comment inside the block is taken as
 * sufficient — the check does not grade the prose. That is deliberate: the
 * cost of the fix is one sentence, and a rule whose remedy is cheap can afford
 * to be strict about whether the sentence exists.
 */

export const id = "async-safety";
export const title = "Unawaited promises and swallowed errors";

/**
 * Server code only. `isClientReachable` is the closure over the import graph,
 * not a directive test, so a `src/lib/` module pulled in by one `"use client"`
 * component is correctly treated as browser code even though it says nothing
 * about itself.
 */
function isServerModule(file, project) {
  if (file.isClient) return false;
  if (project.isClientReachable(file.rel)) return false;
  // Every server root, not just the two that existed when this was written.
  // The Supabase clients, the session resolver and the fee engine all moved
  // out of lib/ in the feature-first restructure; naming roots individually
  // is how a rule quietly stops covering the code it was written for.
  return ["src/app/", "src/lib/", "src/platform/", "src/modules/"].some((root) =>
    file.rel.startsWith(root),
  );
}

/**
 * Next APIs that hand back a promise the caller is not expected to hold.
 *
 * Excluded by symbol and not by name: the identifier `redirect` is fair game
 * for a local helper, and blessing every call to something spelled `redirect`
 * would put a hole in the rule that nobody could see. The declaration has to
 * come out of the installed `next` package.
 *
 * As installed today none of these type as thenable at the call site — Next's
 * `revalidatePath`, `revalidateTag` return void and `redirect`, `notFound`
 * return never, so the rule never reaches this list. It is here for the
 * version bump that changes that, which is the release where a blanket
 * false-positive wave would otherwise arrive unannounced.
 */
const NEXT_UNHELD_PROMISES = new Set([
  "revalidatePath",
  "revalidateTag",
  "redirect",
  "permanentRedirect",
  "notFound",
  "cookies",
  "headers",
  "draftMode",
]);

/** Does this type carry a callable `then`? Union-aware; a `Promise | null` counts. */
function makeThenableTest(ts, checker) {
  return function isThenable(type) {
    if (!type) return false;
    const parts = type.isUnion?.() ? type.types : [type];
    return parts.some((part) => {
      const then = part.getProperty?.("then");
      if (!then) return false;
      const declaration = then.valueDeclaration ?? then.declarations?.[0];
      if (!declaration) return false;
      const thenType = checker.getTypeOfSymbolAtLocation(then, declaration);
      return checker.getSignaturesOfType(thenType, ts.SignatureKind.Call).length > 0;
    });
  };
}

/**
 * Every property name in a call chain, outermost first.
 *
 * `fetch(url).then(read).finally(stop)` yields ["finally", "then"], which is
 * what lets the check see a handler attached three links down rather than only
 * at the end of the expression.
 */
function chainMethodNames(node, ts) {
  const names = [];
  let cursor = node;
  while (cursor) {
    if (ts.isCallExpression(cursor)) { cursor = cursor.expression; continue; }
    if (ts.isPropertyAccessExpression(cursor)) { names.push(cursor.name.text); cursor = cursor.expression; continue; }
    if (ts.isElementAccessExpression(cursor)
      || ts.isNonNullExpression(cursor)
      || ts.isParenthesizedExpression(cursor)) {
      cursor = cursor.expression;
      continue;
    }
    break;
  }
  return names;
}

/** The identifier the call resolves through, for symbol lookup. */
function calleeNameNode(call, ts) {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) return callee.name;
  if (ts.isIdentifier(callee)) return callee;
  return null;
}

function isNextUnheldPromise(call, ts, checker) {
  const nameNode = calleeNameNode(call, ts);
  if (!nameNode || !NEXT_UNHELD_PROMISES.has(nameNode.text)) return false;
  const symbol = checker.getSymbolAtLocation(nameNode);
  const declaration = symbol?.declarations?.[0];
  const origin = declaration?.getSourceFile?.().fileName ?? "";
  return /[/\\]node_modules[/\\]next[/\\]/.test(origin);
}

/**
 * The text between the braces of a `catch` block that holds no statements.
 * Anything non-blank in there is a comment, and a comment is a decision.
 */
function catchBlockIsUndocumented(clause, sourceFile) {
  if (clause.block.statements.length > 0) return false;
  const inner = sourceFile.text.slice(clause.block.getStart(sourceFile) + 1, clause.block.getEnd() - 1);
  return !/\S/.test(inner);
}

export async function run({ project, sink, coverage }) {
  const { ts, program, checker } = await project.program();
  const isThenable = makeThenableTest(ts, checker);

  // The checker only knows about TypeScript. `.mjs` scripts and config files
  // are outside the program and outside both rules; stated in the note rather
  // than quietly dropped.
  const candidates = project.product.filter((file) => file.ext === ".ts" || file.ext === ".tsx");
  let examined = 0;

  for (const file of candidates) {
    const sourceFile = program.getSourceFile(file.absolute);
    if (!sourceFile) continue;
    examined += 1;

    const serverSide = isServerModule(file, project);

    const visit = (node) => {
      if (ts.isCatchClause(node) && catchBlockIsUndocumented(node, sourceFile)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const tried = node.parent && ts.isTryStatement(node.parent)
          ? node.parent.tryBlock.getText(sourceFile).replace(/\s+/g, " ").slice(0, 120)
          : "the try block";
        sink.record({
          rule: "scan.error-swallowed",
          file: file.rel,
          line,
          title: `${file.rel}:${line} catches an error and discards it without a word`,
          expected:
            "A catch block either handles the error, rethrows it, reports it, or carries a "
            + "comment saying why ignoring it is correct.",
          actual:
            `The catch block is empty and holds no comment. Whatever ${tried} throws is `
            + "discarded, and the code after the try runs as though nothing happened.",
          evidence: file.lines[line - 1],
          why:
            "Every empty catch in this repo today wraps a cache bust on a money path — "
            + "revalidateTag(\"fee-policy\") after a promotion, a fee-setup publish, or a session "
            + "write. A failed bust that says nothing leaves the Payment Desk pricing off the "
            + "previous year's schedule for the life of the cache entry, with no error anywhere "
            + "to connect it to.",
          fix:
            "If the failure is genuinely survivable, say so inside the block — one line, the way "
            + "tests/deep/lib/stream.ts does. If it is not, log it or let it propagate.",
        });
      }

      if (serverSide && ts.isExpressionStatement(node)) {
        const expression = node.expression;
        const floating =
          !ts.isAwaitExpression(expression)
          && !ts.isVoidExpression(expression)
          && ts.isCallExpression(expression)
          && !isNextUnheldPromise(expression, ts, checker)
          && !chainMethodNames(expression, ts).some((name) => name === "then" || name === "catch")
          && isThenable(checker.getTypeAtLocation(expression));

        if (floating) {
          const line = sourceFile.getLineAndCharacterOfPosition(expression.getStart(sourceFile)).line + 1;
          sink.record({
            rule: "scan.floating-promise",
            file: file.rel,
            line,
            title: `${file.rel}:${line} starts async work and drops the promise`,
            expected:
              "A promise in server code is awaited, returned, given a .catch, or marked `void` to "
              + "say the fire-and-forget is deliberate.",
            actual:
              "This statement evaluates to a thenable that nothing holds. The rejection path has "
              + "no owner, so a failure surfaces as an unhandledRejection instead of an error the "
              + "caller can act on.",
            evidence: file.lines[line - 1],
            why:
              "On the server the response is already sent by the time this settles. A failed "
              + "write, revalidation or audit row leaves no trace on the request that caused it — "
              + "the office sees a success and the row is not there.",
            fix:
              "await it, return it, or write `void` in front of it the way "
              + "src/lib/defaulters/data.ts and app/protected/exports do — the marker is what tells "
              + "the next reader this was a decision.",
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  coverage.declare({
    check: id,
    dimension: "product .ts/.tsx modules parsed by the TypeScript checker",
    domainSize: candidates.length,
    examined,
    strategy: "exhaustive",
    note:
      "Both rules skip tests and scripts. scan.error-swallowed sweeps the whole product surface; "
      + "scan.floating-promise is narrowed to app/ and lib/ modules no client bundle can reach, "
      + "because the rule is about a rejection arriving after the response — in the browser there "
      + "is no response and the console still shows it. Widening to components/ produced eleven "
      + "hits and eleven of them were calls into helpers whose bodies are wholly try/caught. "
      + "Neither rule sees .mjs or .js: they are outside the program. Not modelled, and real gaps: "
      + "an async callback handed to a sync API (forEach, setTimeout), a `.then` chain with no "
      + "`.catch` on the end, and a catch block whose comment is present but says nothing — a "
      + "comment is accepted as a decision without being read.",
  });
}
