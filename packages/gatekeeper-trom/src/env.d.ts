declare namespace Cloudflare {
  interface Env {
    BASE_URL?: string;
    HKA_TROM_API_URL?: string;
    HKA_TROM_USERNAME?: string;
    HKA_TROM_PASSWORD?: string;
    HKA_TROM_ALLOW_INSECURE?: string;
  }

  interface GlobalProps {
    mainModule: typeof import("./worker.js");
    durableNamespaces: "TromGatekeeper";
  }
}

interface Env extends Cloudflare.Env {}
