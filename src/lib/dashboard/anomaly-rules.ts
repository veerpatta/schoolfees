export type DashboardAnomaly = {
  key: string;
  kind: "price-spike" | "dupe-same-day" | "waiver-burst";
  title: string;
  detail: string;
  reviewHref: string;
};

