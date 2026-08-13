import { describe, expect, it, vi } from "vitest";
import { TromSessionImpl } from "../src/trom.js";
import {
  TromApi,
  type TromApiEnvironment,
} from "../src/trom-api.js";

const PASSWORD = "test-password";
const TOKEN = "test-token";

function environment(overrides: Partial<TromApiEnvironment> = {}): TromApiEnvironment {
  return {
    HKA_TROM_API_URL: "https://trom.example.test",
    HKA_TROM_USERNAME: "service-user",
    HKA_TROM_PASSWORD: PASSWORD,
    HKA_TROM_ALLOW_INSECURE: "false",
    ...overrides,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function apiWith(fetchMock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return new TromApi(environment(), fetchMock, () => new Date("2026-08-13T03:00:00.000Z"));
}

function loginResponse(token = TOKEN) {
  return response({ success: true, token });
}

function dataResponse(data: unknown) {
  return response({ success: true, data });
}

describe("TromApi", () => {
  it("binds the default Worker fetch to globalThis", async () => {
    const fetchMock = vi.fn(function(this: unknown, input: RequestInfo | URL) {
      expect(this).toBe(globalThis);
      return Promise.resolve(String(input).endsWith("/api/login")
        ? loginResponse()
        : dataResponse([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(new TromApi(environment()).listSections()).resolves.toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("logs in lazily, reuses the bearer, and retries one expired bearer once", async () => {
    const requests: Array<{ url: string; authorization?: string; method?: string }> = [];
    let listCalls = 0;
    const api = apiWith(async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(input),
        authorization: headers.get("authorization") ?? undefined,
        method: init?.method,
      });
      if (String(input).endsWith("/api/login")) {
        return loginResponse(requests.filter((request) => request.url.endsWith("/api/login")).length === 1
          ? "first-token"
          : "second-token");
      }
      listCalls++;
      return listCalls === 1
        ? response({ success: false }, 401)
        : dataResponse([{ id: "7", section_code: "A", section_name: "Alpha" }]);
    });

    await expect(api.listSections()).resolves.toEqual([
      { id: 7, code: "A", name: "Alpha", ownerName: null },
    ]);
    await expect(api.listSections()).resolves.toHaveLength(1);

    expect(requests.filter((request) => request.url.endsWith("/api/login"))).toHaveLength(2);
    expect(requests.filter((request) => request.url.endsWith(
      "/api/dashboard/section/list-section-by-ownership",
    ))).toHaveLength(3);
    expect(requests.at(-2)?.authorization).toBe("Bearer second-token");
    expect(requests.at(-1)?.authorization).toBe("Bearer second-token");
    expect(requests.filter((request) => request.url.endsWith("/list-section-by-ownership"))[0]
      .authorization).toBe("Bearer first-token");
  });

  it("keeps the API prefix on dashboard requests", async () => {
    const requests: string[] = [];
    const api = apiWith(async (input) => {
      requests.push(String(input));
      return String(input).endsWith("/api/login")
        ? loginResponse()
        : dataResponse([]);
    });

    await expect(api.getEquipmentAvailabilityBySection({
      start: "2026-08-01",
      end: "2026-08-13",
    })).resolves.toEqual([]);
    expect(requests.at(-1)).toContain(
      "/api/dashboard/equipment-availability/average-percentage-by-section",
    );
  });

  it.each([
    ["invalid date", { start: "2026-02-30", end: "2026-03-01" }],
    ["reversed period", { start: "2026-03-02", end: "2026-03-01" }],
  ])("rejects %s before any upstream call", async (_label, period) => {
    const fetchMock = vi.fn(async () => dataResponse([]));
    const api = apiWith(fetchMock);

    await expect(api.getSpmSlaBySection(period)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defaults omitted periods to the current Asia/Jakarta month through today", async () => {
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return String(input).endsWith("/api/login")
        ? loginResponse()
        : dataResponse([]);
    });
    const api = new TromApi(
      environment(),
      fetchMock,
      () => new Date("2026-08-12T17:00:00.000Z"),
    );

    await api.getSpmSlaBySection();

    const request = new URL(requests.at(-1)!);
    expect(request.searchParams.get("start_month")).toBe("2026-08-01");
    expect(request.searchParams.get("end_month")).toBe("2026-08-13");
  });

  it("rejects an invalid section ID before any upstream call", async () => {
    const fetchMock = vi.fn(async () => dataResponse([]));
    const api = apiWith(fetchMock);

    await expect(api.listIncidents(undefined, 0)).rejects.toThrow("positive integer");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires HTTPS unless the explicit local flag is true", async () => {
    const fetchMock = vi.fn(async () => loginResponse());
    const secureApi = new TromApi(
      environment({ HKA_TROM_API_URL: "http://trom.example.test" }),
      fetchMock,
    );
    const secureError = await secureApi.listSections().catch((error: unknown) => String(error));
    expect(secureError).toContain("HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();

    const insecureApi = new TromApi(
      environment({
        HKA_TROM_API_URL: "http://trom.example.test",
        HKA_TROM_ALLOW_INSECURE: "true",
      }),
      vi.fn(async (input) => String(input).endsWith("/api/login")
        ? loginResponse()
        : dataResponse([])),
    );
    await expect(insecureApi.listSections()).resolves.toEqual([]);
  });

  it("normalizes numeric strings, nullable fields, booleans, and monthly rows", async () => {
    const api = apiWith(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/login")) return loginResponse();
      if (url.includes("/list-incident")) {
        return dataResponse([{
          id: "9",
          section_id: null,
          section_name: null,
          report_number: "INC-9",
          accident_date: "2026-08-01",
          accident_time: "08:30:00",
          incident_name: null,
          status_code: "on_investigation",
          is_accident: "0",
          total_towing: "2",
          total_victims: null,
        }]);
      }
      return dataResponse([{
        id: "7",
        section_code: "A",
        section_name: "Alpha",
        monthly: [{ month: "2026-08-01", cost_budget: "10.5", cost_realization: null, percent: "0" }],
      }]);
    });

    await expect(api.listIncidents()).resolves.toEqual([{
      id: 9,
      sectionId: null,
      sectionName: null,
      reportNumber: "INC-9",
      accidentAt: "2026-08-01 08:30:00",
      name: null,
      status: "on_investigation",
      isAccident: false,
      towingCount: 2,
      victimCount: null,
    }]);
    await expect(api.getRunningCostBySection()).resolves.toEqual([{
      sectionId: 7,
      sectionCode: "A",
      sectionName: "Alpha",
      monthly: [{ month: "2026-08-01", costBudget: 10.5, costRealization: null, percent: 0 }],
    }]);
  });

  it("keeps errors bounded and excludes credentials, tokens, headers, and response bodies", async () => {
    const body = "upstream-secret-response-body";
    const api = new TromApi(
      environment(),
      vi.fn(async () => response({ success: false, password: PASSWORD, body, token: TOKEN }, 500)),
    );

    const error = await api.listSections().catch((caught: unknown) => String(caught));
    expect(error).toContain("500");
    expect(error).not.toContain(PASSWORD);
    expect(error).not.toContain(TOKEN);
    expect(error).not.toContain("Authorization");
    expect(error).not.toContain(body);
  });
});

describe("TromSessionImpl", () => {
  it("authorizes every public read before returning data", async () => {
    const events: string[] = [];
    const fakeApi = {
      listSections: vi.fn(async () => { events.push("fetch"); return []; }),
      getSpmSlaBySection: vi.fn(async () => { events.push("fetch"); return []; }),
      getIncidentCountsBySection: vi.fn(async () => { events.push("fetch"); return []; }),
      listIncidents: vi.fn(async () => { events.push("fetch"); return []; }),
      getInspectionCountsBySection: vi.fn(async () => { events.push("fetch"); return []; }),
      getEquipmentAvailabilityBySection: vi.fn(async () => { events.push("fetch"); return []; }),
      getReportCompleteness: vi.fn(async () => { events.push("fetch"); return {
        totalReport: null, totalReported: null, totalNotReported: null,
      }; }),
      getRunningCostBySection: vi.fn(async () => { events.push("fetch"); return []; }),
    };
    const authorizer = {
      authorizeObservation: vi.fn(async () => { events.push("authorize"); }),
    };
    const session = new TromSessionImpl(
      fakeApi as unknown as TromApi,
      authorizer as never,
    );

    const calls = [
      () => session.listSections(),
      () => session.getSpmSlaBySection(),
      () => session.getIncidentCountsBySection(),
      () => session.listIncidents(),
      () => session.getInspectionCountsBySection(),
      () => session.getEquipmentAvailabilityBySection(),
      () => session.getReportCompleteness(),
      () => session.getRunningCostBySection(),
    ];
    for (const call of calls) {
      events.length = 0;
      await call();
      expect(events).toEqual(["fetch", "authorize"]);
    }
    expect(authorizer.authorizeObservation).toHaveBeenCalledTimes(calls.length);
  });

  it("returns only source-fact field names in source order", async () => {
    const session = new TromSessionImpl({
      listSections: async () => [{ id: 2, code: "B", name: "Beta", ownerName: null }],
    } as unknown as TromApi, { authorizeObservation: vi.fn(async () => {}) } as never);

    const result = await session.listSections();
    expect(result).toEqual([{ id: 2, code: "B", name: "Beta", ownerName: null }]);
    const keys = Object.keys(result[0]);
    expect(keys).toEqual(["id", "code", "name", "ownerName"]);
    expect(keys.every((key) => !/attention|priority|severity|rank|recommend/i.test(key))).toBe(true);
  });
});
