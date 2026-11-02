import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function blockingFindings(sarif) {
  if (sarif?.version !== '2.1.0' || !Array.isArray(sarif.runs)) throw new Error('Invalid SARIF');
  return sarif.runs.flatMap(run => {
    const rules = run.tool?.driver?.rules ?? [];
    if (!Array.isArray(run.results)) throw new Error('Missing CodeQL results');
    return run.results.filter(result => {
      if (result.suppressions?.some(s => s.status === 'accepted')) return false;
      const rule = rules.find(r => r.id === result.ruleId) ?? rules[result.ruleIndex], severity = Number(rule?.properties?.['security-severity'] ?? 0);
      return severity >= 7 || (result.level ?? rule?.defaultConfiguration?.level) === 'error';
    }).map(result => ({ rule: result.ruleId ?? 'unknown', file: result.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? 'unknown' }));
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const dir = process.argv[2]; if (!dir) throw new Error('Missing results'); const files = readdirSync(dir).filter(f => f.endsWith('.sarif')); if (!files.length) throw new Error('Missing SARIF'); const findings = files.flatMap(file => blockingFindings(JSON.parse(readFileSync(join(dir, file), 'utf8')))); if (findings.length) { console.error(`CodeQL release gate: ${findings.length} high/critical or error-level findings.`); for (const finding of findings) console.error(JSON.stringify(finding)); process.exitCode = 1; } else console.log('CodeQL release gate passed.'); }
  catch { console.error('CodeQL release gate could not verify results. Release blocked.'); process.exitCode = 1; }
}
