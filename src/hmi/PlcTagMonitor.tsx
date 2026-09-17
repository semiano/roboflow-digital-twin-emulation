import { useEffect, useRef } from 'react';
import { useSimulationStore } from '@/app/simulationStore';
import type { PlcTags } from '@/controls/PlcTags';
import { Panel } from './Panel';

type TagKey = keyof PlcTags;

const GROUPS: ReadonlyArray<{ title: string; tags: readonly TagKey[] }> = [
  {
    title: 'Machine',
    tags: ['machineState', 'lineRunCommand', 'lineStopCommand', 'lineRunning', 'lineSpeed'],
  },
  { title: 'Sensors', tags: ['pe100Entry', 'pe101Inspection', 'pe102Reject', 'pe103Exit'] },
  {
    title: 'Vision',
    tags: [
      'visionConnected',
      'visionReady',
      'visionBusy',
      'visionResult',
      'visionDefectCode',
      'visionConfidence',
    ],
  },
  { title: 'Reject', tags: ['rejectCommand', 'rejectExtended'] },
  { title: 'Production', tags: ['totalCount', 'goodCount', 'rejectCount'] },
];

function format(value: PlcTags[TagKey]): string {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3);
  return value === '' ? '—' : value;
}

/** Live tag view (spec §24). Recently changed tags are highlighted. */
export function PlcTagMonitor() {
  const tags = useSimulationStore((state) => state.snapshot.tags);
  const previous = useRef<PlcTags>(tags);
  const changedAt = useRef<Map<TagKey, number>>(new Map());
  const renderCount = useRef(0);

  renderCount.current += 1;
  for (const key of Object.keys(tags) as TagKey[]) {
    if (previous.current[key] !== tags[key]) changedAt.current.set(key, renderCount.current);
  }

  useEffect(() => {
    previous.current = tags;
  }, [tags]);

  return (
    <Panel title="PLC Tags">
      <div className="tag-monitor">
        {GROUPS.map((group) => (
          <div key={group.title} className="tag-group">
            <span className="tag-group__title">{group.title}</span>
            {group.tags.map((key) => {
              const recent = renderCount.current - (changedAt.current.get(key) ?? -99) < 5;
              const value = tags[key];
              const truthy = value === true || value === 'RUNNING' || value === 'FAIL';
              return (
                <div key={key} className={`tag-row ${recent ? 'is-changed' : ''}`}>
                  <span className="tag-row__name">{key}</span>
                  <span className={`tag-row__value ${truthy ? 'is-true' : ''}`}>
                    {format(value)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}
