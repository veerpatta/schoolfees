import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ServiceWorkerRegistration } from "@/components/system/service-worker-registration";

describe("ServiceWorkerRegistration", () => {
  it("renders no visible office UI", () => {
    expect(renderToStaticMarkup(<ServiceWorkerRegistration />)).toBe("");
  });
});
