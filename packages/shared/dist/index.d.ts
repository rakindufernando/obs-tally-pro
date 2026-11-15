export type TallyState = 'PROGRAM' | 'PREVIEW' | 'IDLE' | 'OFFLINE';
export type MappingRule = {
    kind: 'SCENE' | 'SOURCE';
    name: string;
    uuid?: string | null;
    excluded?: boolean;
};
export type CameraConfig = {
    id: string;
    number: number;
    name: string;
    enabled: boolean;
    mappings: MappingRule[];
};
export type TreeItem = {
    name: string;
    uuid?: string | null;
    enabled: boolean;
    kind: 'scene' | 'group' | 'source';
    children?: TreeItem[];
};
export type ObsSnapshot = {
    connected: boolean;
    studioMode: boolean;
    program: string | null;
    preview: string | null;
    programUuid?: string | null;
    previewUuid?: string | null;
    scenes: Record<string, TreeItem[]>;
    sceneUuids: Record<string, string>;
    transitionFrom?: string | null;
    streaming: boolean;
    recording: boolean;
};
export declare function sceneContains(scene: string | null, s: ObsSnapshot, rules: MappingRule[]): boolean;
export declare function calculateTally(c: CameraConfig, s: ObsSnapshot): TallyState;
export declare function freshness(bridgeTime: string | null | undefined, obsConnected: boolean, now?: number, timeoutMs?: number): boolean;
