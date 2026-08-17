import {
  DurableObject,
  RpcStub as NativeRpcStub,
  RpcTarget,
  WorkerEntrypoint,
} from "cloudflare:workers";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import type {
  AccountDescription,
  ActionKind,
  AgentCatalog,
  AgentCatalogRequest,
  AppUiContext,
  ApprovalQueue,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperConnectOptions,
  GatekeeperUiFrame,
  GatekeeperUser,
  GatekeeperUserVerifier,
  ObservationAuthorizer,
  ResourceConfiguratorFrame,
  ResourceDescription,
  SlashCommandDescriptor,
  SlashCommandProvider,
  SlashCommandResult,
  SupportedResource,
  VendorDescription,
} from "@gadgets/workshop-shared/gatekeeper";
import TYPES_CODE from "./types.txt";
import {
  TromApi,
  resolvePeriod,
  validateSectionId,
  type MajorAssetDamageExposurePage,
  type MajorAssetDamageExposureQuery,
  type SectionEquipmentAvailability,
  type SectionIncidentCounts,
  type SectionInspectionCounts,
  type SectionRunningCost,
  type SectionSpmSla,
  type ReportCompleteness,
  type SpmSlaIndicatorDetail,
  type SpmSlaTrendPoint,
  type TromIncident,
  type TromPeriod,
  type TromSection,
  type TromSession,
} from "./trom-api.js";

const TROM_ICON = {
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='currentColor'>" +
      "<path d='M32 48h192v32H32zm24 56h144v32H56zm32 56h80v32H88z'/></svg>",
    ),
};

const TROM_EXECUTIVE_REVIEW_PROMPT =
  "Use the HKA TROM capability to conduct an executive investigation of SPM/SLA exposure for the coming quarter. Screen the section portfolio, form candidate hypotheses, drill into relevant operational evidence, seek counter-evidence, and discard weak or immaterial findings. For each remaining finding, state the section, indicator, period, baseline, supporting evidence, contrary evidence, data limitations, materiality, intervention window, confidence, and what would disprove the conclusion. Do not treat missing records as good performance, invent unavailable facts, or produce an opaque risk score. Present the investigation in this chat. Afterward, if Scheduled Tasks is available, offer to establish a monthly investigation and quarterly synthesis in this same chat; do not create recurring automation without explicit approval.";

class TromSlashCommandProvider extends RpcTarget implements SlashCommandProvider {
  /** Lists the one fixed executive investigation command. */
  list(): Promise<SlashCommandDescriptor[]> {
    return Promise.resolve([{
      id: "trom-executive-review",
      name: "trom-executive-review",
      description: "Start a factual executive SPM/SLA investigation.",
    }]);
  }

  /** Expands the fixed command without reading protected TROM data. */
  async invoke(
    id: string,
    _args: string,
    _authorizer: NativeRpcStub<ObservationAuthorizer>,
  ): Promise<SlashCommandResult> {
    if (id !== "trom-executive-review") {
      throw new Error("Unknown HKA TROM slash command.");
    }
    return { message: TROM_EXECUTIVE_REVIEW_PROMPT };
  }

  /** Releases no command-specific resources. */
  [Symbol.dispose](): void {}
}

/** Read-only session implementation backed by the configured deployment service account. */
@validateRpc()
export class TromSessionImpl extends RpcTarget implements TromSession {
  #api: TromApi;
  #approvalQueue: NativeRpcStub<ApprovalQueue>;

  constructor(api: TromApi, approvalQueue: NativeRpcStub<ApprovalQueue>) {
    super();
    this.#api = api;
    this.#approvalQueue = approvalQueue;
  }

  /** Releases the session-owned observation authorizer. */
  [Symbol.dispose](): void {
    this.#approvalQueue[Symbol.dispose]?.();
  }

  /** Lists section identities in source order after observation authorization. */
  async listSections(): Promise<TromSection[]> {
    const sections = await this.#api.listSections();
    await this.#authorize("section identities");
    return sections;
  }

  /** Reads SPM/SLA facts grouped by section after observation authorization. */
  async getSpmSlaBySection(period?: TromPeriod): Promise<SectionSpmSla[]> {
    const resolved = resolvePeriod(period);
    const rows = await this.#api.getSpmSlaBySection(resolved);
    await this.#authorize("SPM/SLA facts", resolved);
    return rows;
  }

  /** Reads monthly SPM/SLA trend facts after observation authorization. */
  async getSpmSlaTrend(period: TromPeriod, sectionId?: number): Promise<SpmSlaTrendPoint[]> {
    const resolved = resolvePeriod(period);
    const validSectionId = validateSectionId(sectionId);
    const rows = await this.#api.getSpmSlaTrend(resolved, validSectionId);
    await this.#authorize("SPM/SLA monthly trend", resolved);
    return rows;
  }

  /** Reads bounded SPM/SLA indicator detail after observation authorization. */
  async getSpmSlaIndicatorDetail(
    sectionId: number,
    period: TromPeriod,
  ): Promise<SpmSlaIndicatorDetail> {
    const resolved = resolvePeriod(period);
    const validSectionId = validateSectionId(sectionId);
    if (validSectionId === undefined) {
      throw new TypeError("TROM indicator detail requires a section ID.");
    }
    const detail = await this.#api.getSpmSlaIndicatorDetail(validSectionId, resolved);
    await this.#authorize(`SPM/SLA indicator detail for section ${validSectionId}`, resolved);
    return detail;
  }

  /** Reads paged major asset damage exposures after observation authorization. */
  async listMajorAssetDamageExposures(
    query: MajorAssetDamageExposureQuery,
  ): Promise<MajorAssetDamageExposurePage> {
    if (query === null || typeof query !== "object" || query.period === undefined) {
      throw new TypeError("TROM major asset damage exposures require a period.");
    }
    if (query.repairStatus !== "OPEN" && query.repairStatus !== "ON_PROGRESS") {
      throw new TypeError("TROM repair status must be OPEN or ON_PROGRESS.");
    }
    if (query.page !== undefined && (!Number.isInteger(query.page) || query.page < 1)) {
      throw new TypeError("TROM page must be a positive integer.");
    }
    if (query.limit !== undefined &&
        (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50)) {
      throw new TypeError("TROM limit must be a positive integer no greater than 50.");
    }
    const period = resolvePeriod(query.period);
    const validSectionId = validateSectionId(query.sectionId);
    const page = await this.#api.listMajorAssetDamageExposures({
      ...query,
      period,
      sectionId: validSectionId,
    });
    const suffix = validSectionId === undefined ? "" : ` for section ${validSectionId}`;
    await this.#authorize(`${query.repairStatus} major asset damage exposures${suffix}`, period);
    return page;
  }

  /** Reads incident counts grouped by section after observation authorization. */
  async getIncidentCountsBySection(period?: TromPeriod): Promise<SectionIncidentCounts[]> {
    const resolved = resolvePeriod(period);
    const rows = await this.#api.getIncidentCountsBySection(resolved);
    await this.#authorize("incident counts", resolved);
    return rows;
  }

  /** Reads incident rows after observation authorization. */
  async listIncidents(period?: TromPeriod, sectionId?: number): Promise<TromIncident[]> {
    const resolved = resolvePeriod(period);
    const validSectionId = validateSectionId(sectionId);
    const rows = await this.#api.listIncidents(resolved, validSectionId);
    const suffix = validSectionId === undefined ? "" : ` for section ${validSectionId}`;
    await this.#authorize(`incident rows${suffix}`, resolved);
    return rows;
  }

  /** Reads inspection counts grouped by section after observation authorization. */
  async getInspectionCountsBySection(period?: TromPeriod): Promise<SectionInspectionCounts[]> {
    const resolved = resolvePeriod(period);
    const rows = await this.#api.getInspectionCountsBySection(resolved);
    await this.#authorize("inspection counts", resolved);
    return rows;
  }

  /** Reads equipment availability facts grouped by section after observation authorization. */
  async getEquipmentAvailabilityBySection(
    period?: TromPeriod,
  ): Promise<SectionEquipmentAvailability[]> {
    const resolved = resolvePeriod(period);
    const rows = await this.#api.getEquipmentAvailabilityBySection(resolved);
    await this.#authorize("equipment availability", resolved);
    return rows;
  }

  /** Reads report totals after observation authorization. */
  async getReportCompleteness(period?: TromPeriod): Promise<ReportCompleteness> {
    const resolved = resolvePeriod(period);
    const report = await this.#api.getReportCompleteness(resolved);
    await this.#authorize("report totals", resolved);
    return report;
  }

  /** Reads monthly running-cost rows grouped by section after observation authorization. */
  async getRunningCostBySection(period?: TromPeriod): Promise<SectionRunningCost[]> {
    const resolved = resolvePeriod(period);
    const rows = await this.#api.getRunningCostBySection(resolved);
    await this.#authorize("monthly running-cost facts", resolved);
    return rows;
  }

  async #authorize(dataset: string, period?: TromPeriod): Promise<void> {
    const requested = period ? ` for ${period.start} through ${period.end}` : "";
    await this.#approvalQueue.authorizeObservation({
      title: `Read HKA TROM ${dataset}`,
      description: `Read factual HKA TROM ${dataset}${requested}.`,
    });
  }
}

/** Ambient Durable Object exposing one read-only HKA TROM session. */
@validateRpc()
export class TromGatekeeper extends DurableObject<Cloudflare.Env> implements Gatekeeper<TromSession> {
  /** Describes the ambient HKA TROM capability. */
  async describe(): Promise<ResourceDescription> {
    return {
      url: "trom://operations",
      title: "HKA TROM Operations",
      snippet: "Read factual operational data from HKA TROM.",
      suggestedBindingName: "TROM",
      tsType: "TromSession",
      hasSlashCommands: true,
    };
  }

  /** Returns the agent-facing HKA TROM declarations. */
  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }

  /** Reports that the capability has no auto-applicable actions. */
  async getAutoApprovableActions(): Promise<ActionKind[]> {
    return [];
  }

  /** Starts a session with a duplicate authorizer owned by that session. */
  async startSession(approvalQueue: NativeRpcStub<ApprovalQueue>): Promise<TromSessionImpl> {
    return new TromSessionImpl(new TromApi(this.env), approvalQueue.dup());
  }

  /** Returns the fixed executive investigation command provider. */
  async getSlashCommandProvider(): Promise<SlashCommandProvider> {
    return new TromSlashCommandProvider();
  }

  /** Returns no catalog because the session methods expose factual datasets directly. */
  async getAgentCatalog(
    _request: AgentCatalogRequest,
    _authorizer: NativeRpcStub<ObservationAuthorizer>,
  ): Promise<AgentCatalog | null> {
    return null;
  }

  /** Accepts collaborators under the existing low-stakes observer policy. */
  async addObserver(_id: string, _user: Fetcher<GatekeeperUserVerifier>): Promise<void> {}

  /** Retains no observer state. */
  async removeObserver(_id: string): Promise<void> {}

  /** Rejects action application because this capability has no mutations. */
  applyAction(_action: number): Promise<void> {
    throw new Error("HKA TROM is read-only and implements no actions.");
  }

  /** Rejects action rejection because this capability submits no actions. */
  rejectAction(_action: number): Promise<void> {
    throw new Error("HKA TROM is read-only and implements no actions.");
  }

  /** Rejects action reversion because this capability submits no actions. */
  revertAction(
    _action: number,
  ): Promise<void | { message?: string; canRetry?: boolean; restart?: boolean }> {
    throw new Error("HKA TROM is read-only and implements no actions.");
  }
}

/** Describes the auto-provisioned HKA TROM account. */
export function describeTromAccount(): AccountDescription {
  return {
    displayName: "HKA TROM",
    avatar: TROM_ICON,
    singleton: { tsType: "TromSession" },
  };
}

/** Auto-provisioned deployment account for HKA TROM. */
@validateRpc()
export class TromAccount extends WorkerEntrypoint<Cloudflare.Env> implements GatekeeperUser {
  /** Describes the account's ambient capability. */
  async describe(): Promise<AccountDescription> {
    return describeTromAccount();
  }

  /** Returns the account-imbued ambient HKA TROM Durable Object class. */
  async getSingletonGatekeeperClass(): Promise<DurableObjectClass<Gatekeeper<TromSession>>> {
    return this.ctx.exports.TromGatekeeper({ props: {} });
  }

  /** HKA TROM has no management UI. */
  startAppUi(_context: AppUiContext): Promise<GatekeeperUiFrame> {
    throw new Error("HKA TROM has no management UI.");
  }

  /** Returns no URL-addressed resources. */
  async getSupportedResources(): Promise<SupportedResource[]> {
    return [];
  }

  /** Rejects URL resource lookup because HKA TROM is ambient-only. */
  getGatekeeperClassFor(_url: string): never {
    throw new Error("HKA TROM has no URL-addressed resources.");
  }

  /** Rejects resource configuration because HKA TROM is ambient-only. */
  startResourceConfigurator(_resourceUrlPattern: string): Promise<ResourceConfiguratorFrame> {
    throw new Error("HKA TROM has no URL-addressed resources.");
  }

  /** Confirms there are no grantable resource scopes. */
  async ensureResources(_resourceUrlPatterns: string[]): Promise<{ url?: string }> {
    return {};
  }

  /** Leaves deployment credentials under administrator control. */
  async revoke(): Promise<void> {}

  /** Rejects reconnect because deployment credentials are not user-managed. */
  reconnect(): Promise<{ url: string }> {
    throw new Error("HKA TROM has no reconnect flow.");
  }

  /** Reports no authenticated human identity. */
  async getAuthenticatedEmail(): Promise<string | null> {
    return null;
  }

  /** Mints the verifier used by the low-stakes observer policy. */
  @skipRpcValidation()
  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
    return this.ctx.exports.TromVerifier({});
  }
}

/** Verifier for the deployment-scoped HKA TROM account. */
@validateRpc()
export class TromVerifier
  extends WorkerEntrypoint<Cloudflare.Env>
  implements GatekeeperUserVerifier
{
  /** Performs the intentionally empty verifier operation. */
  verify(): void {}
}

/** Vendor entrypoint for the auto-provisioned HKA TROM account. */
@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env> {
  /** Describes the HKA TROM vendor. */
  async describe(): Promise<VendorDescription> {
    return {
      displayName: "HKA TROM",
      url: "https://hkatrom.berinovasi.top",
      logo: TROM_ICON,
      tagline: "Read factual HKA TROM operations data",
      description: "Expose HKA TROM operational facts to CloudflareOS as a read-only capability.",
      autoProvisionsAccount: true,
      providesAuth: false,
    };
  }

  /** Mints a fresh opaque deployment account capability. */
  @skipRpcValidation()
  async createAccount(): Promise<Fetcher<GatekeeperUser>> {
    return this.ctx.exports.TromAccount({ props: {} }) as unknown as Fetcher<GatekeeperUser>;
  }

  /** Rejects interactive connection because HKA TROM is auto-provisioned. */
  connectAccount(
    _callback: Fetcher<GatekeeperConnectCallback>,
    _options?: GatekeeperConnectOptions,
  ): Promise<{ url: string }> {
    throw new Error("HKA TROM is auto-provisioned and has no connect flow.");
  }

  /** Returns no URL-addressed resources. */
  async getSupportedResources(_options?: { userId?: string }): Promise<SupportedResource[]> {
    return [];
  }

  /** Returns the complete agent-facing HKA TROM declarations. */
  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }
}
