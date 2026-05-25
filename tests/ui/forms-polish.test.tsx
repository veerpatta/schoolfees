import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SaveBar } from "@/components/forms/save-bar";
import { WhyDisabled } from "@/components/forms/why-disabled";

describe("SaveBar — SSR contract", () => {
  it("renders nothing when not dirty and not saving", () => {
    const html = renderToStaticMarkup(
      <SaveBar dirty={false} onSave={() => {}} />,
    );
    expect(html).toBe("");
  });

  it("renders Save changes when dirty", () => {
    const html = renderToStaticMarkup(
      <SaveBar dirty onSave={() => {}} />,
    );
    expect(html).toContain("Save changes");
    expect(html).toContain("Unsaved changes");
  });

  it("pluralizes unsaved change count", () => {
    const one = renderToStaticMarkup(
      <SaveBar dirty unsavedCount={1} onSave={() => {}} />,
    );
    expect(one).toMatch(/1 unsaved change(?!s)/);

    const many = renderToStaticMarkup(
      <SaveBar dirty unsavedCount={3} onSave={() => {}} />,
    );
    expect(many).toMatch(/3 unsaved changes/);
  });

  it("shows Saving state when saving=true", () => {
    const html = renderToStaticMarkup(
      <SaveBar dirty saving onSave={() => {}} />,
    );
    expect(html).toContain("Saving");
  });
});

describe("WhyDisabled — SSR contract", () => {
  it("renders nothing when no reasons supplied", () => {
    const html = renderToStaticMarkup(<WhyDisabled reasons={[]} />);
    expect(html).toBe("");
  });

  it("renders the trigger when reasons are supplied", () => {
    const html = renderToStaticMarkup(
      <WhyDisabled reasons={["Amount exceeds balance", "Cheque number required"]} />,
    );
    expect(html).toContain("Why is this disabled");
    expect(html).toContain("Why?");
  });
});

