import type { SweetLinkSelectorCandidate } from '@sweetlink/shared';
interface DiscoveryOptions {
    readonly scopeSelector?: string | null;
    readonly limit?: number;
    readonly includeHidden?: boolean;
}
export declare function discoverSelectorCandidates(options: DiscoveryOptions): SweetLinkSelectorCandidate[];
export {};
//# sourceMappingURL=selector-discovery.d.ts.map