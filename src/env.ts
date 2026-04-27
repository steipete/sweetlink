import type { SweetLinkSharedEnv } from "../shared/src/env.js";
import { sweetLinkEnv as sharedSweetLinkEnv } from "../shared/src/env.js";

export const sweetLinkEnv: SweetLinkSharedEnv = sharedSweetLinkEnv;
export const sweetLinkDebug = sweetLinkEnv.debug;
export const sweetLinkCliTestMode = sweetLinkEnv.cliTestMode;

export interface SweetLinkCliEnv {
  readonly caPath: string | null;
  readonly caRoot: string;
  readonly chromePath: string | null;
  readonly devtoolsUrl: string | null;
  readonly chromeProfilePath: string | null;
  readonly cookieDebug: boolean;
  readonly oauthScriptPath: string | null;
}

export function readCliEnv(): SweetLinkCliEnv {
  return {
    caPath: sharedSweetLinkEnv.cliCaPath,
    caRoot: sharedSweetLinkEnv.cliCaRoot,
    chromePath: sharedSweetLinkEnv.cliChromePath,
    devtoolsUrl: sharedSweetLinkEnv.cliDevtoolsUrl,
    chromeProfilePath: sharedSweetLinkEnv.cliChromeProfilePath,
    cookieDebug: sharedSweetLinkEnv.cliCookieDebug,
    oauthScriptPath: sharedSweetLinkEnv.cliOauthScriptPath,
  };
}

export const cliEnv = readCliEnv();
