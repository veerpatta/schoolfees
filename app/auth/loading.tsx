import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Checking access"
      title="Loading the staff sign-in area"
      description="The app is preparing the authentication screen and checking whether a valid staff session already exists."
    />
  );
}
