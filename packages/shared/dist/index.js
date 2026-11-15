export function sceneContains(scene, s, rules) {
    if (!scene)
        return false;
    const matches = (rule, name, uuid, kind) => rule.kind === kind && (rule.uuid ? rule.uuid === uuid : rule.name === name);
    const rootUuid = s.sceneUuids[scene];
    if (rules.some(r => r.excluded && matches(r, scene, rootUuid, 'SCENE')))
        return false;
    if (rules.some(r => !r.excluded && matches(r, scene, rootUuid, 'SCENE')))
        return true;
    const ancestors = new Set();
    function walk(items, level) {
        if (level > 24)
            return false;
        for (const item of items) {
            if (!item.enabled)
                continue;
            const kind = item.kind === 'source' ? 'SOURCE' : 'SCENE';
            if (rules.some(r => r.excluded && matches(r, item.name, item.uuid, kind)))
                continue;
            if (rules.some(r => !r.excluded && matches(r, item.name, item.uuid, kind)))
                return true;
            if (item.children && walk(item.children, level + 1))
                return true;
            if (item.kind === 'scene' && !ancestors.has(item.name)) {
                ancestors.add(item.name);
                if (walk(s.scenes[item.name] || [], level + 1))
                    return true;
                ancestors.delete(item.name);
            }
        }
        return false;
    }
    ancestors.add(scene);
    return walk(s.scenes[scene] || [], 0);
}
export function calculateTally(c, s) {
    if (!s.connected)
        return 'OFFLINE';
    if (!c.enabled)
        return 'IDLE';
    if (sceneContains(s.program, s, c.mappings) || sceneContains(s.transitionFrom || null, s, c.mappings))
        return 'PROGRAM';
    if (s.studioMode && sceneContains(s.preview, s, c.mappings))
        return 'PREVIEW';
    return 'IDLE';
}
export function freshness(bridgeTime, obsConnected, now = Date.now(), timeoutMs = 30_000) {
    if (!obsConnected || !bridgeTime)
        return false;
    const age = now - new Date(bridgeTime).getTime();
    return Number.isFinite(age) && age >= -5000 && age <= timeoutMs;
}
