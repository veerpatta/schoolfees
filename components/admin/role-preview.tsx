import {
  roleDescriptions,
  roleLabels,
  rolePermissions,
  staffRoles,
} from "@/lib/auth/roles";

type RolePreviewProps = {
  title?: string | null;
  description?: string | null;
};

export function RolePreview({
  title = "Role placeholders",
  description = "These are the initial internal roles for the admin shell. Enforcement can be connected to database-backed staff records later.",
}: RolePreviewProps) {
  const hasIntro = Boolean(title || description);

  return (
    <div>
      {hasIntro ? (
        <div>
          {title ? (
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={hasIntro ? "mt-5 grid gap-4 lg:grid-cols-3" : "grid gap-4 lg:grid-cols-3"}>
        {staffRoles.map((role) => (
          <div
            key={role}
            className="rounded-2xl border border-border bg-surface-2 p-4"
          >
            <p className="text-base font-semibold text-foreground">
              {roleLabels[role]}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {roleDescriptions[role]}
            </p>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-foreground">
              {rolePermissions[role].map((permission) => (
                <li key={permission}>{permission}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
