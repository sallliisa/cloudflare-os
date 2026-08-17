export type TromApiEnvironment = Pick<
  Env,
  "HKA_TROM_API_URL" | "HKA_TROM_USERNAME" | "HKA_TROM_PASSWORD" | "HKA_TROM_ALLOW_INSECURE"
>;

export type TromPeriod = { start: string; end: string };

export interface TromSection {
  id: number;
  code: string;
  name: string;
  ownerName: string | null;
}

export interface SectionSpmSla {
  sectionId: number;
  sectionName: string | null;
  scoreSpm: number | null;
  scoreSla: number | null;
  totalSpm: number | null;
}

/** One monthly SPM/SLA trend point returned by HKA TROM. */
export interface SpmSlaTrendPoint {
  month: string | null;
  scoreSpm: number | null;
  scoreSla: number | null;
}

/** One bounded SPM indicator result returned by HKA TROM. */
export interface SpmSlaIndicator {
  id: number;
  serviceSubstanceId: number | null;
  code: string | null;
  indicator: string | null;
  subIndicator: string | null;
  spmSpecification: string | null;
  spmParameter: number | null;
  slaSpecification: string | null;
  slaParameter: number | null;
  operator: string | null;
  unit: string | null;
  spmScore: boolean | null;
  slaScore: boolean | null;
  resultBasis: "measured-or-default-unidentified";
}

/** Bounded SPM/SLA indicator detail for one section and period. */
export interface SpmSlaIndicatorDetail {
  sectionId: number;
  sectionName: string | null;
  lastUpdatedAt: string | null;
  scoreSpm: number | null;
  scoreSla: number | null;
  indicators: SpmSlaIndicator[];
  truncated: boolean;
}

/** Repair states supported by the major-damage endpoint. */
export type MajorAssetDamageRepairStatus = "OPEN" | "ON_PROGRESS";

/** Bounded query for major asset damage exposures. */
export interface MajorAssetDamageExposureQuery {
  period: TromPeriod;
  repairStatus: MajorAssetDamageRepairStatus;
  sectionId?: number;
  page?: number;
  limit?: number;
}

/** Safe, person-free projection of one major asset damage exposure. */
export interface MajorAssetDamageExposure {
  id: number;
  sectionId: number;
  sectionName: string | null;
  date: string | null;
  assetLabel: string | null;
  staStart: number | null;
  staEnd: number | null;
  damageCategory: string | null;
  damageCriteria: string | null;
  damageDescription: string | null;
  repairPriority: string | null;
  repairRecommendation: string | null;
  repairStatus: string | null;
  majorRepairType: string | null;
  currentStage: number | null;
  spmDueAt: string | null;
  slaDueAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** One bounded page of major asset damage exposures. */
export interface MajorAssetDamageExposurePage {
  rows: MajorAssetDamageExposure[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

export interface SectionIncidentCounts {
  sectionId: number;
  sectionName: string | null;
  total: number | null;
  onInvestigation: number | null;
  closed: number | null;
  accidents: number | null;
  notAccidents: number | null;
}

export interface TromIncident {
  id: number;
  sectionId: number | null;
  sectionName: string | null;
  reportNumber: string | null;
  accidentAt: string | null;
  name: string | null;
  status: string | null;
  isAccident: boolean | null;
  towingCount: number | null;
  victimCount: number | null;
}

export interface SectionInspectionCounts {
  sectionId: number;
  sectionCode: string | null;
  sectionName: string | null;
  total: number | null;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  p1: number | null;
  p2: number | null;
}

export interface SectionEquipmentAvailability {
  sectionId: number;
  sectionCode: string | null;
  sectionName: string | null;
  ownerId: number | null;
  ownerName: string | null;
  color: string | null;
  percentVms: number | null;
  percentCctv: number | null;
}

export interface ReportCompleteness {
  totalReport: number | null;
  totalReported: number | null;
  totalNotReported: number | null;
}

export interface RunningCostMonth {
  month: string | null;
  costBudget: number | null;
  costRealization: number | null;
  percent: number | null;
}

export interface SectionRunningCost {
  sectionId: number;
  sectionCode: string | null;
  sectionName: string | null;
  monthly: RunningCostMonth[];
}

export interface TromSession {
  listSections(): Promise<TromSection[]>;
  getSpmSlaBySection(period?: TromPeriod): Promise<SectionSpmSla[]>;
  getSpmSlaTrend(period: TromPeriod, sectionId?: number): Promise<SpmSlaTrendPoint[]>;
  getSpmSlaIndicatorDetail(
    sectionId: number,
    period: TromPeriod,
  ): Promise<SpmSlaIndicatorDetail>;
  listMajorAssetDamageExposures(
    query: MajorAssetDamageExposureQuery,
  ): Promise<MajorAssetDamageExposurePage>;
  getIncidentCountsBySection(period?: TromPeriod): Promise<SectionIncidentCounts[]>;
  listIncidents(period?: TromPeriod, sectionId?: number): Promise<TromIncident[]>;
  getInspectionCountsBySection(period?: TromPeriod): Promise<SectionInspectionCounts[]>;
  getEquipmentAvailabilityBySection(
    period?: TromPeriod,
  ): Promise<SectionEquipmentAvailability[]>;
  getReportCompleteness(period?: TromPeriod): Promise<ReportCompleteness>;
  getRunningCostBySection(period?: TromPeriod): Promise<SectionRunningCost[]>;
}

type JsonRecord = Record<string, unknown>;
type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Clock = () => Date;

const REQUEST_TIMEOUT_MS = 15_000;

/** Normalize and fetch the factual HKA TROM dashboard endpoints. */
export class TromApi {
  #env: TromApiEnvironment;
  #fetch: FetchImplementation;
  #now: Clock;
  #token: string | undefined;
  #baseUrl: URL | undefined;

  constructor(
    env: TromApiEnvironment,
    fetchImplementation: FetchImplementation = globalThis.fetch.bind(globalThis),
    now: Clock = () => new Date(),
  ) {
    this.#env = env;
    this.#fetch = fetchImplementation;
    this.#now = now;
  }

  /** Lists section identity fields without exposing dashboard placeholder statistics. */
  async listSections(): Promise<TromSection[]> {
    const data = await this.#arrayData("listSections", "/dashboard/section/list-section-by-ownership");
    return data.map((row) => ({
      id: requiredNumber(row, "id", "listSections"),
      code: requiredString(row, ["section_code", "code"], "listSections"),
      name: requiredString(row, ["section_name", "short_name", "name"], "listSections"),
      ownerName: stringOrNull(valueOf(row, ["owner_name", "ownerName"]), "listSections"),
    }));
  }

  /** Returns source SPM/SLA facts grouped by section. */
  async getSpmSlaBySection(period?: TromPeriod): Promise<SectionSpmSla[]> {
    const resolved = resolvePeriod(period, this.#now);
    const data = await this.#arrayData(
      "getSpmSlaBySection",
      "/dashboard/spm-sla/recap-spm-sla-by-section",
      periodParams(resolved),
    );
    return data.map((row) => ({
      sectionId: requiredNumber(row, "id", "getSpmSlaBySection"),
      sectionName: stringOrNull(valueOf(row, ["section_name", "name"]), "getSpmSlaBySection"),
      scoreSpm: numberOrNull(valueOf(row, ["score_spm", "scoreSpm"]), "getSpmSlaBySection"),
      scoreSla: numberOrNull(valueOf(row, ["score_sla", "scoreSla"]), "getSpmSlaBySection"),
      totalSpm: numberOrNull(valueOf(row, ["total_spm", "totalSpm"]), "getSpmSlaBySection"),
    }));
  }

  /** Returns monthly SPM/SLA trend facts in the source order. */
  async getSpmSlaTrend(period: TromPeriod, sectionId?: number): Promise<SpmSlaTrendPoint[]> {
    const resolved = resolvePeriod(period, this.#now);
    const params = periodParams(resolved);
    const validSectionId = validateSectionId(sectionId);
    if (validSectionId !== undefined) params.set("section_id", String(validSectionId));
    const data = await this.#arrayData(
      "getSpmSlaTrend",
      "/dashboard/spm-sla/trend-spm-sla",
      params,
    );
    return data.map((row) => ({
      month: stringOrNull(valueOf(row, ["month"]), "getSpmSlaTrend"),
      scoreSpm: numberOrNull(valueOf(row, ["score_spm", "scoreSpm"]), "getSpmSlaTrend"),
      scoreSla: numberOrNull(valueOf(row, ["score_sla", "scoreSla"]), "getSpmSlaTrend"),
    }));
  }

  /** Returns bounded SPM indicator detail without inferring result provenance. */
  async getSpmSlaIndicatorDetail(
    sectionId: number,
    period: TromPeriod,
  ): Promise<SpmSlaIndicatorDetail> {
    const resolved = resolvePeriod(period, this.#now);
    const validSectionId = validateSectionId(sectionId);
    if (validSectionId === undefined) {
      throw new TypeError("TROM indicator detail requires a section ID.");
    }
    const operation = "getSpmSlaIndicatorDetail";
    const body = await this.#request(
      operation,
      "/dashboard/spm-sla/detail-section-spm-sla",
      new URLSearchParams({
        section_id: String(validSectionId),
        start_periode: resolved.start,
        end_periode: resolved.end,
      }),
    );
    if (!Array.isArray(body.data)) invalidData(operation);
    const indicators = body.data
      .map((entry) => asRecord(entry, operation))
      .filter((row) => row.category === "spm");
    const truncated = indicators.length > 250;
    return {
      sectionId: requiredNumber(body, "section_id", operation),
      sectionName: stringOrNull(valueOf(body, ["section_name"]), operation),
      lastUpdatedAt: stringOrNull(valueOf(body, ["last_updated_at", "lastUpdatedAt"]), operation),
      scoreSpm: numberOrNull(valueOf(body, ["score_spm", "scoreSpm"]), operation),
      scoreSla: numberOrNull(valueOf(body, ["score_sla", "scoreSla"]), operation),
      indicators: indicators.slice(0, 250).map((row) => ({
        id: requiredNumber(row, "id", operation),
        serviceSubstanceId: numberOrNull(
          valueOf(row, ["service_substance_id", "serviceSubstanceId"]), operation,
        ),
        code: stringOrNull(valueOf(row, ["code"]), operation),
        indicator: stringOrNull(valueOf(row, ["indicator"]), operation),
        subIndicator: stringOrNull(valueOf(row, ["sub_indicator", "subIndicator"]), operation),
        spmSpecification: stringOrNull(
          valueOf(row, ["spm_specification", "spmSpecification"]), operation,
        ),
        spmParameter: numberOrNull(valueOf(row, ["spm_parameter", "spmParameter"]), operation),
        slaSpecification: stringOrNull(
          valueOf(row, ["sla_specification", "slaSpecification"]), operation,
        ),
        slaParameter: numberOrNull(valueOf(row, ["sla_parameter", "slaParameter"]), operation),
        operator: stringOrNull(valueOf(row, ["operator", "rel_operator"]), operation),
        unit: stringOrNull(valueOf(row, ["unit", "rel_unit"]), operation),
        spmScore: booleanOrNull(valueOf(row, ["spm_score", "spmScore"]), operation),
        slaScore: booleanOrNull(valueOf(row, ["sla_score", "slaScore"]), operation),
        resultBasis: "measured-or-default-unidentified" as const,
      })),
      truncated,
    };
  }

  /** Returns a bounded, person-free page of major asset damage exposures. */
  async listMajorAssetDamageExposures(
    query: MajorAssetDamageExposureQuery,
  ): Promise<MajorAssetDamageExposurePage> {
    if (!isRecord(query) || !isRecord(query.period)) {
      throw new TypeError("TROM major asset damage exposures require a period.");
    }
    const period = resolvePeriod(query.period, this.#now);
    const repairStatus = validateRepairStatus(query.repairStatus);
    const sectionId = validateSectionId(query.sectionId);
    const page = validatePageNumber(query.page, "page", 1);
    const limit = validatePageNumber(query.limit, "limit", 50, 50);
    const params = new URLSearchParams({
      start_date: period.start,
      end_date: period.end,
      repair_status_code: repairStatus,
      page: String(page),
      limit: String(limit),
    });
    if (sectionId !== undefined) params.set("section_id", String(sectionId));

    const operation = "listMajorAssetDamageExposures";
    const body = await this.#request(operation, "/major-asset-damages/list", params);
    if (!Array.isArray(body.data)) invalidData(operation);
    return {
      rows: body.data.map((entry) => {
        const row = asRecord(entry, operation);
        return {
          id: requiredNumber(row, "id", operation),
          sectionId: requiredNumber(row, "section_id", operation),
          sectionName: stringOrNull(
            valueOf(row, ["rel_section_id", "section_name", "sectionName"]), operation,
          ),
          date: stringOrNull(valueOf(row, ["date"]), operation),
          assetLabel: stringOrNull(
            valueOf(row, ["rel_asset_id", "asset_label", "assetLabel"]), operation,
          ),
          staStart: numberOrNull(valueOf(row, ["sta_start", "staStart"]), operation),
          staEnd: numberOrNull(valueOf(row, ["sta_end", "staEnd"]), operation),
          damageCategory: stringOrNull(
            valueOf(row, ["rel_damage_category_id", "damage_category"]), operation,
          ),
          damageCriteria: stringOrNull(valueOf(row, ["damage_criteria"]), operation),
          damageDescription: stringOrNull(valueOf(row, ["damage_description"]), operation),
          repairPriority: stringOrNull(valueOf(row, ["repair_priority"]), operation),
          repairRecommendation: stringOrNull(
            valueOf(row, ["rel_repair_recommendation_id", "repair_recommendation"]), operation,
          ),
          repairStatus: stringOrNull(valueOf(row, ["repair_status_code"]), operation),
          majorRepairType: stringOrNull(valueOf(row, ["major_repair_type"]), operation),
          currentStage: numberOrNull(valueOf(row, ["stage", "current_stage"]), operation),
          spmDueAt: stringOrNull(valueOf(row, ["spm_due_at"]), operation),
          slaDueAt: stringOrNull(valueOf(row, ["sla_due_at"]), operation),
          createdAt: stringOrNull(valueOf(row, ["created_at"]), operation),
          updatedAt: stringOrNull(valueOf(row, ["updated_at"]), operation),
        };
      }),
      total: requiredNumber(body, "total", operation),
      totalPages: requiredNumber(body, "totalPage", operation),
      page,
      limit,
    };
  }

  /** Returns source incident counts grouped by section. */
  async getIncidentCountsBySection(period?: TromPeriod): Promise<SectionIncidentCounts[]> {
    const resolved = resolvePeriod(period, this.#now);
    const data = await this.#arrayData(
      "getIncidentCountsBySection",
      "/dashboard/incident/recap-by-section",
      periodParams(resolved),
    );
    return data.map((row) => ({
      sectionId: requiredNumber(row, "id", "getIncidentCountsBySection"),
      sectionName: stringOrNull(
        valueOf(row, ["section_name", "name"]), "getIncidentCountsBySection",
      ),
      total: numberOrNull(valueOf(row, ["total"]), "getIncidentCountsBySection"),
      onInvestigation: numberOrNull(
        valueOf(row, ["on_investigation", "onInvestigation"]), "getIncidentCountsBySection",
      ),
      closed: numberOrNull(valueOf(row, ["close", "closed"]), "getIncidentCountsBySection"),
      accidents: numberOrNull(
        valueOf(row, ["accident", "accidents"]), "getIncidentCountsBySection",
      ),
      notAccidents: numberOrNull(
        valueOf(row, ["not_accident", "notAccidents"]), "getIncidentCountsBySection",
      ),
    }));
  }

  /** Returns source incident rows in their original order. */
  async listIncidents(period?: TromPeriod, sectionId?: number): Promise<TromIncident[]> {
    const resolved = resolvePeriod(period, this.#now);
    const params = periodParams(resolved);
    const validSectionId = validateSectionId(sectionId);
    if (validSectionId !== undefined) params.set("section_id", String(validSectionId));
    const data = await this.#arrayData(
      "listIncidents",
      "/dashboard/incident/list-incident",
      params,
    );
    return data.map((row) => ({
      id: requiredNumber(row, "id", "listIncidents"),
      sectionId: numberOrNull(valueOf(row, ["section_id", "sectionId"]), "listIncidents"),
      sectionName: stringOrNull(valueOf(row, ["section_name", "sectionName"]), "listIncidents"),
      reportNumber: stringOrNull(valueOf(row, ["report_number", "reportNumber"]), "listIncidents"),
      accidentAt: incidentDateTime(row, "listIncidents"),
      name: stringOrNull(valueOf(row, ["incident_name", "name"]), "listIncidents"),
      status: stringOrNull(valueOf(row, ["status_code", "status"]), "listIncidents"),
      isAccident: booleanOrNull(valueOf(row, ["is_accident", "isAccident"]), "listIncidents"),
      towingCount: numberOrNull(
        valueOf(row, ["total_towing", "towing_count", "towingCount"]), "listIncidents",
      ),
      victimCount: numberOrNull(
        valueOf(row, ["total_victims", "victim_count", "victimCount"]), "listIncidents",
      ),
    }));
  }

  /** Returns source inspection counts grouped by section. */
  async getInspectionCountsBySection(period?: TromPeriod): Promise<SectionInspectionCounts[]> {
    const resolved = resolvePeriod(period, this.#now);
    const data = await this.#arrayData(
      "getInspectionCountsBySection",
      "/dashboard/inspections/recap-by-section",
      periodParams(resolved),
    );
    return data.map((row) => ({
      sectionId: requiredNumber(row, "id", "getInspectionCountsBySection"),
      sectionCode: stringOrNull(
        valueOf(row, ["section_code", "sectionCode"]), "getInspectionCountsBySection",
      ),
      sectionName: stringOrNull(
        valueOf(row, ["section_name", "name"]), "getInspectionCountsBySection",
      ),
      total: numberOrNull(valueOf(row, ["total"]), "getInspectionCountsBySection"),
      r1: numberOrNull(valueOf(row, ["r1"]), "getInspectionCountsBySection"),
      r2: numberOrNull(valueOf(row, ["r2"]), "getInspectionCountsBySection"),
      r3: numberOrNull(valueOf(row, ["r3"]), "getInspectionCountsBySection"),
      p1: numberOrNull(valueOf(row, ["p1"]), "getInspectionCountsBySection"),
      p2: numberOrNull(valueOf(row, ["p2"]), "getInspectionCountsBySection"),
    }));
  }

  /** Returns source equipment availability facts grouped by section. */
  async getEquipmentAvailabilityBySection(
    period?: TromPeriod,
  ): Promise<SectionEquipmentAvailability[]> {
    const resolved = resolvePeriod(period, this.#now);
    const data = await this.#arrayData(
      "getEquipmentAvailabilityBySection",
      "/dashboard/equipment-availability/average-percentage-by-section",
      periodParams(resolved),
    );
    return data.map((row) => ({
      sectionId: requiredNumber(row, "id", "getEquipmentAvailabilityBySection"),
      sectionCode: stringOrNull(
        valueOf(row, ["section_code", "sectionCode"]), "getEquipmentAvailabilityBySection",
      ),
      sectionName: stringOrNull(
        valueOf(row, ["section_name", "name"]), "getEquipmentAvailabilityBySection",
      ),
      ownerId: numberOrNull(valueOf(row, ["owner_id", "ownerId"]), "getEquipmentAvailabilityBySection"),
      ownerName: stringOrNull(
        valueOf(row, ["owner_name", "ownerName"]), "getEquipmentAvailabilityBySection",
      ),
      color: stringOrNull(valueOf(row, ["color"]), "getEquipmentAvailabilityBySection"),
      percentVms: numberOrNull(
        valueOf(row, ["percent_vms", "percentVms"]), "getEquipmentAvailabilityBySection",
      ),
      percentCctv: numberOrNull(
        valueOf(row, ["percent_cctv", "percentCctv"]), "getEquipmentAvailabilityBySection",
      ),
    }));
  }

  /** Returns source report totals for one calendar month's period. */
  async getReportCompleteness(period?: TromPeriod): Promise<ReportCompleteness> {
    const resolved = resolvePeriod(period, this.#now);
    if (resolved.start.slice(0, 7) !== resolved.end.slice(0, 7)) {
      throw new TypeError("TROM report completeness supports one calendar month only.");
    }
    const data = await this.#objectData(
      "getReportCompleteness",
      "/dashboard/activity/recap-by-report-status",
      new URLSearchParams({ month: resolved.start }),
    );
    return {
      totalReport: numberOrNull(valueOf(data, ["total_report", "totalReport"]), "getReportCompleteness"),
      totalReported: numberOrNull(
        valueOf(data, ["total_reported", "totalReported"]), "getReportCompleteness",
      ),
      totalNotReported: numberOrNull(
        valueOf(data, ["total_not_reported", "totalNotReported"]), "getReportCompleteness",
      ),
    };
  }

  /** Returns source monthly running-cost rows grouped by section. */
  async getRunningCostBySection(period?: TromPeriod): Promise<SectionRunningCost[]> {
    const resolved = resolvePeriod(period, this.#now);
    const data = await this.#arrayData(
      "getRunningCostBySection",
      "/dashboard/cost-running/plan-realization-cost-by-section",
      periodParams(resolved),
    );
    return data.map((row) => {
      const monthly = valueOf(row, ["monthly"]);
      if (!Array.isArray(monthly)) invalidData("getRunningCostBySection");
      return {
        sectionId: requiredNumber(row, "id", "getRunningCostBySection"),
        sectionCode: stringOrNull(
          valueOf(row, ["section_code", "sectionCode"]), "getRunningCostBySection",
        ),
        sectionName: stringOrNull(
          valueOf(row, ["section_name", "name"]), "getRunningCostBySection",
        ),
        monthly: monthly.map((entry) => {
          const month = asRecord(entry, "getRunningCostBySection");
          return {
            month: stringOrNull(valueOf(month, ["month"]), "getRunningCostBySection"),
            costBudget: numberOrNull(
              valueOf(month, ["cost_budget", "costBudget"]), "getRunningCostBySection",
            ),
            costRealization: numberOrNull(
              valueOf(month, ["cost_realization", "costRealization"]), "getRunningCostBySection",
            ),
            percent: numberOrNull(valueOf(month, ["percent"]), "getRunningCostBySection"),
          };
        }),
      };
    });
  }

  async #arrayData(
    operation: string,
    path: string,
    params?: URLSearchParams,
  ): Promise<JsonRecord[]> {
    const body = await this.#request(operation, path, params);
    if (!Array.isArray(body.data)) invalidData(operation);
    return body.data.map((entry) => asRecord(entry, operation));
  }

  async #objectData(
    operation: string,
    path: string,
    params?: URLSearchParams,
  ): Promise<JsonRecord> {
    const body = await this.#request(operation, path, params);
    return asRecord(body.data, operation);
  }

  async #request(
    operation: string,
    path: string,
    params?: URLSearchParams,
  ): Promise<JsonRecord> {
    let token = await this.#ensureToken();
    let response = await this.#send(operation, this.#requestUrl(path, params), token);
    if (response.status === 401) {
      this.#token = undefined;
      token = await this.#login();
      response = await this.#send(operation, this.#requestUrl(path, params), token);
    }
    if (!response.ok) throw requestFailed(operation, response.status);
    return await readEnvelope(response, operation);
  }

  async #ensureToken(): Promise<string> {
    if (this.#token) return this.#token;
    return await this.#login();
  }

  async #login(): Promise<string> {
    const config = this.#config();
    const response = await this.#send(
      "login",
      this.#requestUrl("/api/login"),
      undefined,
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ username: config.username, password: config.password }),
      },
    );
    if (!response.ok) throw requestFailed("login", response.status);
    const body = await readEnvelope(response, "login");
    if (body.mfa_required === true) throw new Error("TROM login requires MFA.");
    const nested = isRecord(body.data) ? body.data : undefined;
    const token = stringOrNull(
      body.token ?? body.access_token ?? nested?.token ?? nested?.access_token,
      "login",
    );
    if (!token) throw new Error("TROM login returned no bearer token.");
    this.#token = token;
    return token;
  }

  async #send(
    operation: string,
    url: URL,
    token?: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    try {
      return await this.#fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error(`TROM ${operation} request failed.`);
    }
  }

  #requestUrl(path: string, params?: URLSearchParams): URL {
    const base = this.#config().baseUrl;
    const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
    const apiPath = path.startsWith("/api/") ? path : `/api${path}`;
    const url = new URL(`${basePath}${apiPath.replace(/^\/+/, "")}`, base.origin);
    if (params) url.search = params.toString();
    return url;
  }

  #config(): { baseUrl: URL; username: string; password: string } {
    if (this.#baseUrl) {
      const username = this.#env.HKA_TROM_USERNAME?.trim();
      const password = this.#env.HKA_TROM_PASSWORD;
      if (!username || !password) throw new Error("HKA TROM credentials are not configured.");
      return { baseUrl: this.#baseUrl, username, password };
    }

    const rawUrl = this.#env.HKA_TROM_API_URL?.trim();
    const username = this.#env.HKA_TROM_USERNAME?.trim();
    const password = this.#env.HKA_TROM_PASSWORD;
    if (!rawUrl || !username || !password) {
      throw new Error("HKA TROM is not configured.");
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error("HKA TROM API URL is invalid.");
    }
    if (parsed.username || parsed.password) {
      throw new Error("HKA TROM API URL must not contain credentials.");
    }
    if (parsed.protocol !== "https:" &&
        !(parsed.protocol === "http:" && this.#env.HKA_TROM_ALLOW_INSECURE === "true")) {
      throw new Error("HKA TROM API URL must use HTTPS.");
    }
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "").replace(/\/api$/, "") || "/";
    this.#baseUrl = parsed;
    return { baseUrl: parsed, username, password };
  }
}

export function resolvePeriod(period: TromPeriod | undefined, now: Clock = () => new Date()): TromPeriod {
  if (period === undefined) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const start = `${values.year}-${values.month}-01`;
    const end = `${values.year}-${values.month}-${values.day}`;
    return { start, end };
  }
  const input = period as unknown as JsonRecord;
  const start = validateDate(input.start, "period.start");
  const end = validateDate(input.end, "period.end");
  if (start > end) throw new TypeError("TROM period start must not be after period end.");
  return { start, end };
}

export function validateSectionId(sectionId: number | undefined): number | undefined {
  if (sectionId === undefined) return undefined;
  if (!Number.isInteger(sectionId) || sectionId <= 0) {
    throw new TypeError("TROM section ID must be a positive integer.");
  }
  return sectionId;
}

function validateRepairStatus(value: unknown): MajorAssetDamageRepairStatus {
  if (value !== "OPEN" && value !== "ON_PROGRESS") {
    throw new TypeError("TROM repair status must be OPEN or ON_PROGRESS.");
  }
  return value;
}

function validatePageNumber(
  value: unknown,
  label: string,
  defaultValue: number,
  maximum?: number,
): number {
  const number = value === undefined ? defaultValue : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) {
    throw new TypeError(`TROM ${label} must be a positive integer.`);
  }
  if (maximum !== undefined && number > maximum) {
    throw new TypeError(`TROM ${label} must not exceed ${maximum}.`);
  }
  return number;
}

function periodParams(period: TromPeriod): URLSearchParams {
  return new URLSearchParams({ start_month: period.start, end_month: period.end });
}

function validateDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`Invalid ${label}; expected YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`Invalid ${label}; expected YYYY-MM-DD.`);
  }
  return value;
}

async function readEnvelope(response: Response, operation: string): Promise<JsonRecord> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`TROM ${operation} returned an invalid response.`);
  }
  if (!isRecord(body) || body.success !== true) {
    throw new Error(`TROM ${operation} returned an unsuccessful response.`);
  }
  return body;
}

function requestFailed(operation: string, status: number): Error {
  return new Error(`TROM ${operation} request failed (${status}).`);
}

function asRecord(value: unknown, operation: string): JsonRecord {
  if (!isRecord(value)) invalidData(operation);
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueOf(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  return undefined;
}

function requiredNumber(record: JsonRecord, key: string, operation: string): number {
  const value = numberOrNull(valueOf(record, [key]), operation);
  if (value === null) invalidData(operation);
  return value;
}

function requiredString(record: JsonRecord, keys: string[], operation: string): string {
  const value = stringOrNull(valueOf(record, keys), operation);
  if (value === null) invalidData(operation);
  return value;
}

function numberOrNull(value: unknown, operation: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) invalidData(operation);
  return number;
}

function stringOrNull(value: unknown, operation: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  invalidData(operation);
}

function booleanOrNull(value: unknown, operation: string): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  invalidData(operation);
}

function incidentDateTime(record: JsonRecord, operation: string): string | null {
  const direct = stringOrNull(valueOf(record, ["accident_at", "accidentAt"]), operation);
  if (direct !== null) return direct;
  const date = stringOrNull(valueOf(record, ["accident_date"]), operation);
  const time = stringOrNull(valueOf(record, ["accident_time"]), operation);
  if (date === null) return time;
  return time === null ? date : `${date} ${time}`;
}

function invalidData(operation: string): never {
  throw new Error(`TROM ${operation} returned invalid data.`);
}
