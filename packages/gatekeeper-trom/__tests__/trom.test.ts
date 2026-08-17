import { RpcStub as NativeRpcStub, RpcTarget } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { TromGatekeeper, TromSessionImpl } from "../src/trom.js";
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

  it("normalizes the bounded SPM/SLA trend and sends its period and section", async () => {
    const requests: string[] = [];
    const api = apiWith(async (input) => {
      requests.push(String(input));
      return String(input).endsWith("/api/login")
        ? loginResponse()
        : dataResponse([{ month: "2026-07-01", score_spm: "96.5", score_sla: null }]);
    });

    await expect(api.getSpmSlaTrend({ start: "2026-07-01", end: "2026-08-13" }, 7))
      .resolves.toEqual([{ month: "2026-07-01", scoreSpm: 96.5, scoreSla: null }]);
    const request = new URL(requests.at(-1)!);
    expect(request.pathname).toBe("/api/dashboard/spm-sla/trend-spm-sla");
    expect(Object.fromEntries(request.searchParams)).toEqual({
      start_month: "2026-07-01",
      end_month: "2026-08-13",
      section_id: "7",
    });
  });

  it("filters and caps mixed SPM indicator detail without claiming result provenance", async () => {
    const requests: string[] = [];
    const rows = [
      { category: "substance", id: "3", name: "Safety" },
      ...Array.from({ length: 251 }, (_, index) => ({
        category: "spm",
        id: String(index + 1),
        service_substance_id: "3",
        code: `SPM-${index + 1}`,
        indicator: `Indicator ${index + 1}`,
        sub_indicator: index === 0 ? null : `Sub ${index + 1}`,
        spm_specification: ">= 95",
        spm_parameter: "95",
        sla_specification: "< 2",
        sla_parameter: "2",
        operator: "gte",
        unit: "%",
        spm_score: index % 2 === 0 ? "1" : "0",
        sla_score: null,
      })),
    ];
    const api = apiWith(async (input) => {
      requests.push(String(input));
      return String(input).endsWith("/api/login")
        ? loginResponse()
        : response({
        success: true,
        section_id: "7",
        section_name: "Alpha",
        last_updated_at: "2026-08-13T03:00:00Z",
        score_spm: "80",
        score_sla: null,
        data: rows,
      });
    });

    const result = await api.getSpmSlaIndicatorDetail(7, {
      start: "2026-08-01",
      end: "2026-08-13",
    });
    const request = new URL(requests.at(-1)!);
    expect(request.pathname).toBe("/api/dashboard/spm-sla/detail-section-spm-sla");
    expect(Object.fromEntries(request.searchParams)).toEqual({
      section_id: "7",
      start_periode: "2026-08-01",
      end_periode: "2026-08-13",
    });
    expect(result.sectionId).toBe(7);
    expect(result.scoreSpm).toBe(80);
    expect(result.scoreSla).toBeNull();
    expect(result.indicators).toHaveLength(250);
    expect(result.truncated).toBe(true);
    expect(result.indicators[0]).toEqual({
      id: 1,
      serviceSubstanceId: 3,
      code: "SPM-1",
      indicator: "Indicator 1",
      subIndicator: null,
      spmSpecification: ">= 95",
      spmParameter: 95,
      slaSpecification: "< 2",
      slaParameter: 2,
      operator: "gte",
      unit: "%",
      spmScore: true,
      slaScore: null,
      resultBasis: "measured-or-default-unidentified",
    });
    expect(result.indicators.at(-1)?.id).toBe(250);
  });

  it("projects paged major damage exposures without sensitive upstream fields", async () => {
    const requests: string[] = [];
    const api = apiWith(async (input) => {
      requests.push(String(input));
      return String(input).endsWith("/api/login")
        ? loginResponse()
        : response({
          success: true,
          data: [{
            id: "4",
            section_id: "7",
            rel_section_id: "Alpha",
            date: "2026-08-12",
            rel_asset_id: "Bridge 1 Jalur A",
            sta_start: "10.5",
            sta_end: "11.5",
            rel_damage_category_id: "Pothole",
            damage_criteria: "Wide",
            damage_description: "Surface damage",
            repair_priority: "P1",
            rel_repair_recommendation_id: "Internal repair",
            repair_status_code: "ON_PROGRESS",
            major_repair_type: "INTERNAL_REPAIR",
            stage: "40",
            spm_due_at: "2026-08-14T00:00:00Z",
            sla_due_at: null,
            created_at: "2026-08-12T00:00:00Z",
            updated_at: "2026-08-13T00:00:00Z",
            damage_followed_up_by: 99,
            img_damage: { url: "secret" },
            latitude: "-6.2",
            longitude: "106.8",
            raw_file: "secret",
          }],
          total: "1",
          totalPage: "1",
        });
    });

    const result = await api.listMajorAssetDamageExposures({
      period: { start: "2026-08-01", end: "2026-08-13" },
      repairStatus: "ON_PROGRESS",
      sectionId: 7,
      page: 2,
      limit: 25,
    });
    expect(result).toEqual({
      rows: [{
        id: 4,
        sectionId: 7,
        sectionName: "Alpha",
        date: "2026-08-12",
        assetLabel: "Bridge 1 Jalur A",
        staStart: 10.5,
        staEnd: 11.5,
        damageCategory: "Pothole",
        damageCriteria: "Wide",
        damageDescription: "Surface damage",
        repairPriority: "P1",
        repairRecommendation: "Internal repair",
        repairStatus: "ON_PROGRESS",
        majorRepairType: "INTERNAL_REPAIR",
        currentStage: 40,
        spmDueAt: "2026-08-14T00:00:00Z",
        slaDueAt: null,
        createdAt: "2026-08-12T00:00:00Z",
        updatedAt: "2026-08-13T00:00:00Z",
      }],
      total: 1,
      totalPages: 1,
      page: 2,
      limit: 25,
    });
    expect(Object.keys(result.rows[0])).not.toEqual(
      expect.arrayContaining(["damage_followed_up_by", "img_damage", "latitude", "longitude", "raw_file"]),
    );
    const request = new URL(requests.at(-1)!);
    expect(request.pathname).toBe("/api/major-asset-damages/list");
    expect(Object.fromEntries(request.searchParams)).toEqual({
      start_date: "2026-08-01",
      end_date: "2026-08-13",
      repair_status_code: "ON_PROGRESS",
      page: "2",
      limit: "25",
      section_id: "7",
    });

    await expect(api.listMajorAssetDamageExposures({
      period: { start: "2026-08-01", end: "2026-08-13" },
      repairStatus: "OPEN",
    })).resolves.toMatchObject({ page: 1, limit: 50 });
    const defaultRequest = new URL(requests.at(-1)!);
    expect(defaultRequest.searchParams.get("repair_status_code")).toBe("OPEN");
    expect(defaultRequest.searchParams.get("page")).toBe("1");
    expect(defaultRequest.searchParams.get("limit")).toBe("50");
  });

  it.each([
    ["status", { period: { start: "2026-08-01", end: "2026-08-13" }, repairStatus: "CLOSED" }],
    ["section", { period: { start: "2026-08-01", end: "2026-08-13" }, repairStatus: "OPEN", sectionId: 0 }],
    ["page", { period: { start: "2026-08-01", end: "2026-08-13" }, repairStatus: "OPEN", page: 1.5 }],
    ["limit", { period: { start: "2026-08-01", end: "2026-08-13" }, repairStatus: "OPEN", limit: 51 }],
    ["period", { period: { start: "2026-02-30", end: "2026-08-13" }, repairStatus: "OPEN" }],
  ])("rejects invalid exposure %s before any upstream call", async (_label, query) => {
    const fetchMock = vi.fn(async () => dataResponse([]));
    const api = apiWith(fetchMock);

    await expect(api.listMajorAssetDamageExposures(query as never)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-month report completeness before any upstream call", async () => {
    const fetchMock = vi.fn(async () => dataResponse({}));
    const api = apiWith(fetchMock);

    await expect(api.getReportCompleteness({
      start: "2026-07-31",
      end: "2026-08-01",
    })).rejects.toThrow("one calendar month");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing required normalized detail fields", async () => {
    const api = apiWith(async (input) => String(input).endsWith("/api/login")
      ? loginResponse()
      : response({ success: true, data: [] }));

    await expect(api.getSpmSlaIndicatorDetail(7, {
      start: "2026-08-01",
      end: "2026-08-13",
    })).rejects.toThrow("invalid data");
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
      getSpmSlaTrend: vi.fn(async () => { events.push("fetch"); return []; }),
      getSpmSlaIndicatorDetail: vi.fn(async () => { events.push("fetch"); return {
        sectionId: 1,
        sectionName: null,
        lastUpdatedAt: null,
        scoreSpm: null,
        scoreSla: null,
        indicators: [],
        truncated: false,
      }; }),
      listMajorAssetDamageExposures: vi.fn(async () => { events.push("fetch"); return {
        rows: [], total: 0, totalPages: 0, page: 1, limit: 50,
      }; }),
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
      () => session.getSpmSlaTrend({ start: "2026-08-01", end: "2026-08-13" }),
      () => session.getSpmSlaIndicatorDetail(1, { start: "2026-08-01", end: "2026-08-13" }),
      () => session.listMajorAssetDamageExposures({
        period: { start: "2026-08-01", end: "2026-08-13" },
        repairStatus: "OPEN",
      }),
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

describe("TROM executive slash command", () => {
  it("advertises and expands one fixed command without reading TROM", async () => {
    const gatekeeper = TromGatekeeper.prototype as unknown as TromGatekeeper;
    const description = await gatekeeper.describe();
    expect(description.hasSlashCommands).toBe(true);

    const provider = await gatekeeper.getSlashCommandProvider();
    const authorizeObservation = vi.fn(async () => {});
    class TestAuthorizer extends RpcTarget {
      authorizeObservation(): Promise<void> {
        return authorizeObservation();
      }
    }
    const authorizer = new NativeRpcStub(new TestAuthorizer());
    const expected =
      "Use the HKA TROM capability to conduct an executive investigation of SPM/SLA exposure for the coming quarter. Screen the section portfolio, form candidate hypotheses, drill into relevant operational evidence, seek counter-evidence, and discard weak or immaterial findings. For each remaining finding, state the section, indicator, period, baseline, supporting evidence, contrary evidence, data limitations, materiality, intervention window, confidence, and what would disprove the conclusion. Do not treat missing records as good performance, invent unavailable facts, or produce an opaque risk score. Present the investigation in this chat. Afterward, if Scheduled Tasks is available, offer to establish a monthly investigation and quarterly synthesis in this same chat; do not create recurring automation without explicit approval.";

    try {
      await expect(provider.list()).resolves.toEqual([{
        id: "trom-executive-review",
        name: "trom-executive-review",
        description: "Start a factual executive SPM/SLA investigation.",
      }]);
      await expect(provider.invoke(
        "trom-executive-review",
        "prioritize section 7",
        authorizer as never,
      )).resolves.toEqual({ message: expected });
      await expect(provider.invoke("trom-executive-review", "", authorizer as never))
        .resolves.toEqual({ message: expected });
      await expect(provider.invoke("unknown", "", authorizer as never)).rejects.toThrow(
        "Unknown HKA TROM slash command",
      );
      expect(authorizeObservation).not.toHaveBeenCalled();
    } finally {
      authorizer[Symbol.dispose]?.();
      (provider as unknown as { [Symbol.dispose]?: () => void })[Symbol.dispose]?.();
    }
  });
});
