"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClassStatus } from "@/lib/db/types";
import type { MasterDataActionState } from "@/app/protected/master-data/actions";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type SessionItem = {
  id: string;
  session_label: string;
  status: ClassStatus;
  is_current: boolean;
  notes: string | null;
};

type ClassItem = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
  sort_order: number;
  status: ClassStatus;
  notes: string | null;
};

type RouteItem = {
  id: string;
  route_code: string | null;
  route_name: string;
  default_installment_amount: number;
  is_active: boolean;
  notes: string | null;
};

type FeeHeadItem = {
  id: string;
  label: string;
  isActive: boolean;
};

type PaymentModeItem = {
  value: string;
  label: string;
  isActive: boolean;
};

type ActionFn = (
  previous: MasterDataActionState,
  formData: FormData,
) => Promise<MasterDataActionState>;

type MasterDataClientProps = {
  sessions: SessionItem[];
  classes: ClassItem[];
  routes: RouteItem[];
  feeHeads: FeeHeadItem[];
  paymentModes: PaymentModeItem[];
  actions: {
    createSessionAction: ActionFn;
    updateSessionAction: ActionFn;
    deleteSessionAction: ActionFn;
    setLiveActiveSessionAction: ActionFn;
    createClassAction: ActionFn;
    updateClassAction: ActionFn;
    deleteClassAction: ActionFn;
    createRouteAction: ActionFn;
    updateRouteAction: ActionFn;
    deleteRouteAction: ActionFn;
    createFeeHeadAction: ActionFn;
    updateFeeHeadAction: ActionFn;
    deleteFeeHeadAction: ActionFn;
    setPaymentModeActiveAction: ActionFn;
  };
  initialActionState: MasterDataActionState;
};

function ActionMessage({ state }: { state: MasterDataActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <div
      className={
        state.status === "error"
          ? "rounded-md border bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground"
          : "rounded-md border bg-success-soft px-3 py-2 text-sm text-success-soft-foreground"
      }
    >
      {state.message}
    </div>
  );
}

function SessionStatusSelect({ name, value }: { name: string; value: ClassStatus }) {
  return (
    <select name={name} defaultValue={value} className={selectClassName}>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
      <option value="archived">Archived</option>
    </select>
  );
}

export function MasterDataClient({
  sessions,
  classes,
  routes,
  feeHeads,
  paymentModes,
  actions,
  initialActionState,
}: MasterDataClientProps) {
  const [sessionCreateState, createSessionFormAction] = useActionState(
    actions.createSessionAction,
    initialActionState,
  );
  const [sessionUpdateState, updateSessionFormAction] = useActionState(
    actions.updateSessionAction,
    initialActionState,
  );
  const [sessionDeleteState, deleteSessionFormAction] = useActionState(
    actions.deleteSessionAction,
    initialActionState,
  );
  const [setLiveSessionState, setLiveSessionFormAction] = useActionState(
    actions.setLiveActiveSessionAction,
    initialActionState,
  );

  const [classCreateState, createClassFormAction] = useActionState(
    actions.createClassAction,
    initialActionState,
  );
  const [classUpdateState, updateClassFormAction] = useActionState(
    actions.updateClassAction,
    initialActionState,
  );
  const [classDeleteState, deleteClassFormAction] = useActionState(
    actions.deleteClassAction,
    initialActionState,
  );

  const [routeCreateState, createRouteFormAction] = useActionState(
    actions.createRouteAction,
    initialActionState,
  );
  const [routeUpdateState, updateRouteFormAction] = useActionState(
    actions.updateRouteAction,
    initialActionState,
  );
  const [routeDeleteState, deleteRouteFormAction] = useActionState(
    actions.deleteRouteAction,
    initialActionState,
  );
  const [feeHeadCreateState, createFeeHeadFormAction] = useActionState(
    actions.createFeeHeadAction,
    initialActionState,
  );
  const [feeHeadUpdateState, updateFeeHeadFormAction] = useActionState(
    actions.updateFeeHeadAction,
    initialActionState,
  );
  const [feeHeadDeleteState, deleteFeeHeadFormAction] = useActionState(
    actions.deleteFeeHeadAction,
    initialActionState,
  );
  const [paymentModeState, setPaymentModeFormAction] = useActionState(
    actions.setPaymentModeActiveAction,
    initialActionState,
  );
  const [classSearch, setClassSearch] = useState("");
  const [routeSearch, setRouteSearch] = useState("");

  const normalizedClassSearch = classSearch.trim().toLowerCase();
  const normalizedRouteSearch = routeSearch.trim().toLowerCase();
  const filteredClasses = normalizedClassSearch
    ? classes.filter((item) => {
        const searchHaystack = [
          item.session_label,
          item.class_name,
          item.section ?? "",
          item.stream_name ?? "",
          item.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return searchHaystack.includes(normalizedClassSearch);
      })
    : classes;
  const filteredRoutes = normalizedRouteSearch
    ? routes.filter((item) => {
        const searchHaystack = [
          item.route_code ?? "",
          item.route_name,
          item.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return searchHaystack.includes(normalizedRouteSearch);
      })
    : routes;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Supporting lists overview
            </p>
            <h2 className="mt-2 font-heading text-xl font-semibold text-foreground">
              Keep sessions, classes, routes, and fee catalogs moving fast
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Use the compact controls below to add or adjust master data without losing the main
              fee setup workflow.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="#master-data-sessions">Sessions</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="#master-data-classes">Classes</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="#master-data-routes">Routes</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="#master-data-fee-heads">Fee heads</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="#master-data-payment-modes">Payment modes</a>
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
            Sessions: <strong className="text-foreground">{sessions.length}</strong>
          </div>
          <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
            Classes: <strong className="text-foreground">{classes.length}</strong>
          </div>
          <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
            Routes: <strong className="text-foreground">{routes.length}</strong>
          </div>
          <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
            Fee heads: <strong className="text-foreground">{feeHeads.length}</strong>
          </div>
          <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
            Payment modes: <strong className="text-foreground">{paymentModes.length}</strong>
          </div>
        </div>
      </section>

      <section id="master-data-sessions" className="space-y-4 rounded-2xl border border-border bg-card p-4 scroll-mt-24">
        <h2 className="text-lg font-semibold text-foreground">Academic Sessions</h2>
        <ActionMessage state={sessionCreateState} />
        <ActionMessage state={sessionUpdateState} />
        <ActionMessage state={sessionDeleteState} />
        <ActionMessage state={setLiveSessionState} />

        <form action={createSessionFormAction} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label htmlFor="newSessionLabel">Session label</Label>
            <Input id="newSessionLabel" name="sessionLabel" placeholder="2026-27" className="mt-1" required />
          </div>
          <div>
            <Label>Status</Label>
            <SessionStatusSelect name="sessionStatus" value="active" />
          </div>
          <div className="md:col-span-5">
            <Label htmlFor="newSessionNotes">Notes</Label>
            <Input id="newSessionNotes" name="sessionNotes" className="mt-1" />
          </div>
          <Button type="submit" className="md:col-span-5 w-fit">Add session</Button>
        </form>

        <div className="max-h-[28rem] space-y-3 overflow-auto pr-1">
          {sessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-sm text-muted-foreground">
              No academic sessions saved yet. Add the active session before configuring
              classes, fee defaults, or ledger generation.
            </div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="rounded-xl border border-border p-3">
                <form action={updateSessionFormAction} className="grid gap-3 md:grid-cols-5">
                  <input type="hidden" name="sessionId" value={session.id} />
                  <div className="md:col-span-2">
                    <Label>Session label</Label>
                    <Input name="sessionLabel" defaultValue={session.session_label} className="mt-1" required />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <SessionStatusSelect name="sessionStatus" value={session.status} />
                  </div>
                  <div className="space-y-2">
                    <Label>Live app session</Label>
                    <input type="hidden" name="isCurrentSession" value={session.is_current ? "yes" : "no"} />
                    <span
                      className={
                        session.is_current
                          ? "inline-flex h-8 items-center rounded-md border border-success/30 bg-success-soft px-2.5 text-xs font-semibold text-success-soft-foreground"
                          : "inline-flex h-8 items-center rounded-md border border-border bg-surface-2 px-2.5 text-xs font-semibold text-muted-foreground"
                      }
                    >
                      {session.is_current ? "Live now" : "Not live"}
                    </span>
                  </div>
                  <div className="md:col-span-5">
                    <Label>Notes</Label>
                    <Input name="sessionNotes" defaultValue={session.notes ?? ""} className="mt-1" />
                  </div>
                  <div className="flex flex-wrap gap-2 md:col-span-5">
                    <Button type="submit">Save session</Button>
                  </div>
                </form>
                <form action={deleteSessionFormAction} className="mt-2">
                  <input type="hidden" name="sessionId" value={session.id} />
                  <Button type="submit" variant="outline">Delete session</Button>
                </form>
                {!session.is_current ? (
                  <form
                    action={setLiveSessionFormAction}
                    className="mt-2"
                    onSubmit={(event) => {
                      if (
                        !window.confirm(
                          `Switch the entire app to view ${session.session_label}? Staff currently posting payments will see ${session.session_label} on their next page load.`,
                        )
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="sessionLabel" value={session.session_label} />
                    <input type="hidden" name="confirmSessionLabel" value={session.session_label} />
                    <Button type="submit" variant="outline">Make this the live session</Button>
                  </form>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <div className="grid gap-6 2xl:grid-cols-2">
        <section id="master-data-classes" className="space-y-4 rounded-2xl border border-border bg-card p-4 scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Classes</h2>
            <p className="text-sm text-muted-foreground">
              Search the class list, then edit rows inline. Delete actions stay on the same row.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <Label htmlFor="class-search">Search classes</Label>
            <Input
              id="class-search"
              value={classSearch}
              onChange={(event) => setClassSearch(event.target.value)}
              placeholder="Class name, section, session"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Showing {filteredClasses.length} of {classes.length} classes
            </p>
          </div>
        </div>
        <ActionMessage state={classCreateState} />
        <ActionMessage state={classUpdateState} />
        <ActionMessage state={classDeleteState} />

        <form action={createClassFormAction} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-6">
          <div>
            <Label>Session</Label>
            <select name="sessionLabel" className={selectClassName} required>
              <option value="">Select session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.session_label}>
                  {session.session_label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Class name</Label>
            <Input name="className" className="mt-1" required />
          </div>
          <div>
            <Label>Section</Label>
            <Input name="section" className="mt-1" />
          </div>
          <div>
            <Label>Stream</Label>
            <Input name="streamName" className="mt-1" />
          </div>
          <div>
            <Label>Sort order</Label>
            <Input name="sortOrder" type="number" min={0} defaultValue={0} className="mt-1" required />
          </div>
          <div>
            <Label>Status</Label>
            <SessionStatusSelect name="classStatus" value="active" />
          </div>
          <div className="md:col-span-6">
            <Label>Notes</Label>
            <Input name="classNotes" className="mt-1" />
          </div>
          <Button type="submit" className="md:col-span-6 w-fit">Add class</Button>
        </form>

        <div className="max-h-[32rem] space-y-3 overflow-auto pr-1">
          {filteredClasses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-sm text-muted-foreground">
              No matching classes found. Clear the search or add a new class row.
            </div>
          ) : (
            filteredClasses.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3">
                <form action={updateClassFormAction} className="grid gap-3 md:grid-cols-6">
                  <input type="hidden" name="classId" value={item.id} />
                  <div>
                    <Label>Session</Label>
                    <select name="sessionLabel" defaultValue={item.session_label} className={selectClassName} required>
                      {sessions.map((session) => (
                        <option key={session.id} value={session.session_label}>
                          {session.session_label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Class name</Label>
                    <Input name="className" defaultValue={item.class_name} className="mt-1" required />
                  </div>
                  <div>
                    <Label>Section</Label>
                    <Input name="section" defaultValue={item.section ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label>Stream</Label>
                    <Input name="streamName" defaultValue={item.stream_name ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label>Sort order</Label>
                    <Input name="sortOrder" type="number" min={0} defaultValue={item.sort_order} className="mt-1" required />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <SessionStatusSelect name="classStatus" value={item.status} />
                  </div>
                  <div className="md:col-span-6">
                    <Label>Notes</Label>
                    <Input name="classNotes" defaultValue={item.notes ?? ""} className="mt-1" />
                  </div>
                  <div className="flex flex-wrap gap-2 md:col-span-6">
                    <Button type="submit">Save class</Button>
                    <Button type="submit" variant="outline" formAction={deleteClassFormAction}>
                      Delete class
                    </Button>
                  </div>
                </form>
              </div>
            ))
          )}
        </div>
      </section>

        <section id="master-data-routes" className="space-y-4 rounded-2xl border border-border bg-card p-4 scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Transport Routes</h2>
            <p className="text-sm text-muted-foreground">
              Search the route list, then edit route fee rows inline.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <Label htmlFor="route-search">Search routes</Label>
            <Input
              id="route-search"
              value={routeSearch}
              onChange={(event) => setRouteSearch(event.target.value)}
              placeholder="Route code or route name"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Showing {filteredRoutes.length} of {routes.length} routes
            </p>
          </div>
        </div>
        <ActionMessage state={routeCreateState} />
        <ActionMessage state={routeUpdateState} />
        <ActionMessage state={routeDeleteState} />

        <form action={createRouteFormAction} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-5">
          <div>
            <Label>Route code</Label>
            <Input name="routeCode" className="mt-1" />
          </div>
          <div>
            <Label>Route name</Label>
            <Input name="routeName" className="mt-1" required />
          </div>
          <div>
            <Label>Default installment amount</Label>
            <Input name="defaultInstallmentAmount" type="number" min={0} defaultValue={0} className="mt-1" required />
          </div>
          <div>
            <Label>Active</Label>
            <select name="routeIsActive" defaultValue="yes" className={selectClassName}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <Label>Notes</Label>
            <Input name="routeNotes" className="mt-1" />
          </div>
          <Button type="submit" className="md:col-span-5 w-fit">Add route</Button>
        </form>

        <div className="max-h-[32rem] space-y-3 overflow-auto pr-1">
          {filteredRoutes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-sm text-muted-foreground">
              No matching routes found. Clear the search or add a new route row.
            </div>
          ) : (
            filteredRoutes.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3">
                <form action={updateRouteFormAction} className="grid gap-3 md:grid-cols-5">
                  <input type="hidden" name="routeId" value={item.id} />
                  <div>
                    <Label>Route code</Label>
                    <Input name="routeCode" defaultValue={item.route_code ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label>Route name</Label>
                    <Input name="routeName" defaultValue={item.route_name} className="mt-1" required />
                  </div>
                  <div>
                    <Label>Default installment amount</Label>
                    <Input
                      name="defaultInstallmentAmount"
                      type="number"
                      min={0}
                      defaultValue={item.default_installment_amount}
                      className="mt-1"
                      required
                    />
                  </div>
                  <div>
                    <Label>Active</Label>
                    <select
                      name="routeIsActive"
                      defaultValue={item.is_active ? "yes" : "no"}
                      className={selectClassName}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Input name="routeNotes" defaultValue={item.notes ?? ""} className="mt-1" />
                  </div>
                  <div className="flex flex-wrap gap-2 md:col-span-5">
                    <Button type="submit">Save route</Button>
                    <Button type="submit" variant="outline" formAction={deleteRouteFormAction}>
                      Delete route
                    </Button>
                  </div>
                </form>
              </div>
            ))
          )}
        </div>
      </section>
      </div>

      <div className="grid gap-6 2xl:grid-cols-2">
        <section id="master-data-fee-heads" className="space-y-4 rounded-2xl border border-border bg-card p-4 scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Custom fee heads</h2>
            <p className="text-sm text-muted-foreground">
              Define the named fee-head catalog here, then use the live fee setup rows to assign
              amounts where needed.
            </p>
          </div>
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Editable</span>
        </div>

        <ActionMessage state={feeHeadCreateState} />
        <ActionMessage state={feeHeadUpdateState} />
        <ActionMessage state={feeHeadDeleteState} />

        <form action={createFeeHeadFormAction} className="flex flex-col gap-3 rounded-xl border border-border p-3 md:flex-row md:items-end">
          <div className="flex-1">
            <Label htmlFor="feeHeadLabel">Fee head label</Label>
            <Input id="feeHeadLabel" name="feeHeadLabel" className="mt-1" placeholder="Lab fee" required />
          </div>
          <Button type="submit" className="w-fit">Add fee head</Button>
        </form>

        {feeHeads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-sm text-muted-foreground">
            No custom fee heads are active right now. Add one above when the school needs an extra
            named fee type beyond tuition, transport, books, or admission/activity/misc.
          </div>
        ) : (
          <div className="space-y-3">
            {feeHeads.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3">
                <form action={updateFeeHeadFormAction} className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
                  <input type="hidden" name="feeHeadId" value={item.id} />
                  <div>
                    <Label>Fee head label</Label>
                    <Input name="feeHeadLabel" defaultValue={item.label} className="mt-1" required />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select
                      name="feeHeadIsActive"
                      defaultValue={item.isActive ? "yes" : "no"}
                      className={selectClassName}
                    >
                      <option value="yes">Active</option>
                      <option value="no">Inactive</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">Save</Button>
                  </div>
                </form>
                <form action={deleteFeeHeadFormAction} className="mt-2">
                  <input type="hidden" name="feeHeadId" value={item.id} />
                  <Button type="submit" variant="outline">Delete</Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

        <section id="master-data-payment-modes" className="space-y-4 rounded-2xl border border-border bg-card p-4 scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Accepted payment modes</h2>
            <p className="text-sm text-muted-foreground">
              Keep the accepted payment modes aligned with the live collection desk.
            </p>
          </div>
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Editable</span>
        </div>

        <ActionMessage state={paymentModeState} />

        <div className="space-y-2">
          {paymentModes.map((item) => (
            <form
              key={item.value}
              action={setPaymentModeFormAction}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <input type="hidden" name="paymentMode" value={item.value} />
              <input type="hidden" name="modeIsActive" value={item.isActive ? "no" : "yes"} />
              <div>
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.value}</p>
              </div>
              <Button type="submit" variant="outline">
                {item.isActive ? "Disable" : "Enable"}
              </Button>
            </form>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
