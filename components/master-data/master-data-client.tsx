"use client";

import { useActionState } from "react";

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
          ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
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

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">Academic Sessions</h2>
        <ActionMessage state={sessionCreateState} />
        <ActionMessage state={sessionUpdateState} />
        <ActionMessage state={sessionDeleteState} />

        <form action={createSessionFormAction} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label htmlFor="newSessionLabel">Session label</Label>
            <Input id="newSessionLabel" name="sessionLabel" placeholder="2026-27" className="mt-1" required />
          </div>
          <div>
            <Label>Status</Label>
            <SessionStatusSelect name="sessionStatus" value="active" />
          </div>
          <div>
            <Label>Current session</Label>
            <select name="isCurrentSession" defaultValue="yes" className={selectClassName}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div className="md:col-span-5">
            <Label htmlFor="newSessionNotes">Notes</Label>
            <Input id="newSessionNotes" name="sessionNotes" className="mt-1" />
          </div>
          <Button type="submit" className="md:col-span-5 w-fit">Add session</Button>
        </form>

        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="rounded-xl border border-slate-200 p-3">
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
                <div>
                  <Label>Current session</Label>
                  <select
                    name="isCurrentSession"
                    defaultValue={session.is_current ? "yes" : "no"}
                    className={selectClassName}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
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
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">Classes</h2>
        <ActionMessage state={classCreateState} />
        <ActionMessage state={classUpdateState} />
        <ActionMessage state={classDeleteState} />

        <form action={createClassFormAction} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-6">
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

        <div className="space-y-3">
          {classes.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-3">
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
                </div>
              </form>
              <form action={deleteClassFormAction} className="mt-2">
                <input type="hidden" name="classId" value={item.id} />
                <Button type="submit" variant="outline">Delete class</Button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">Transport Routes</h2>
        <ActionMessage state={routeCreateState} />
        <ActionMessage state={routeUpdateState} />
        <ActionMessage state={routeDeleteState} />

        <form action={createRouteFormAction} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-5">
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

        <div className="space-y-3">
          {routes.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-3">
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
                </div>
              </form>
              <form action={deleteRouteFormAction} className="mt-2">
                <input type="hidden" name="routeId" value={item.id} />
                <Button type="submit" variant="outline">Delete route</Button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">Fee Heads</h2>
        <ActionMessage state={feeHeadCreateState} />
        <ActionMessage state={feeHeadUpdateState} />
        <ActionMessage state={feeHeadDeleteState} />

        <form action={createFeeHeadFormAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3">
          <div className="min-w-[240px] flex-1">
            <Label>Fee head label</Label>
            <Input name="feeHeadLabel" className="mt-1" required />
          </div>
          <Button type="submit">Add fee head</Button>
        </form>

        <div className="space-y-3">
          {feeHeads.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-3">
              <form action={updateFeeHeadFormAction} className="grid gap-3 md:grid-cols-3">
                <input type="hidden" name="feeHeadId" value={item.id} />
                <div>
                  <Label>Label</Label>
                  <Input name="feeHeadLabel" defaultValue={item.label} className="mt-1" required />
                </div>
                <div>
                  <Label>Active</Label>
                  <select
                    name="feeHeadIsActive"
                    defaultValue={item.isActive ? "yes" : "no"}
                    className={selectClassName}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button type="submit">Save fee head</Button>
                </div>
              </form>
              <form action={deleteFeeHeadFormAction} className="mt-2">
                <input type="hidden" name="feeHeadId" value={item.id} />
                <Button type="submit" variant="outline">Delete fee head</Button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">Payment Modes</h2>
        <ActionMessage state={paymentModeState} />
        <div className="space-y-2">
          {paymentModes.map((item) => (
            <form key={item.value} action={setPaymentModeFormAction} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
              <div>
                <p className="font-medium text-slate-900">{item.label}</p>
                <p className="text-xs text-slate-500">{item.value}</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="hidden" name="paymentMode" value={item.value} />
                <select name="modeIsActive" defaultValue={item.isActive ? "yes" : "no"} className={selectClassName}>
                  <option value="yes">Active</option>
                  <option value="no">Inactive</option>
                </select>
                <Button type="submit" variant="outline">Save</Button>
              </div>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
