import type { EquipmentItem } from '../ui/types';

export interface EquipmentPanelProps {
  equipment: EquipmentItem[];
  selectedEquipmentId?: string;
  onSelect: (item: EquipmentItem) => void;
  onUpgrade: (item: EquipmentItem) => void;
}

export function EquipmentPanel({
  equipment,
  selectedEquipmentId,
  onSelect,
  onUpgrade,
}: EquipmentPanelProps) {
  const selected =
    equipment.find((item) => item.id === selectedEquipmentId) ?? equipment[0];

  return (
    <section
      className="tf-panel tf-equipment-panel"
      aria-labelledby="equipment-heading"
    >
      <div className="tf-panel-heading">
        <div>
          <span className="tf-kicker">Plant upgrades</span>
          <h2 id="equipment-heading">Equipment &amp; upgrades</h2>
        </div>
        <span className="tf-step-label">OPS</span>
      </div>

      <div className="tf-equipment-list">
        {equipment.map((item) => (
          <button
            className={`tf-equipment-item ${
              item.id === selected?.id ? 'is-selected' : ''
            } ${item.status === 'locked' ? 'is-locked' : ''}`}
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
          >
            <span className="tf-equipment-icon">{item.icon}</span>
            <span>
              <strong>{item.name}</strong>
              <small>
                {item.category} ·{' '}
                {item.level ? `Level ${item.level}` : 'Base'}
              </small>
            </span>
            <span className="tf-item-arrow">
              {item.status === 'locked' ? '⊘' : '›'}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="tf-upgrade-detail">
          <div>
            <span className="tf-mini-label">Next improvement</span>
            <strong>{selected.nextUpgrade}</strong>
          </div>
          <button
            className="tf-button tf-button-secondary"
            type="button"
            disabled={selected.status !== 'available'}
            onClick={() => onUpgrade(selected)}
          >
            {selected.status === 'locked'
              ? 'Locked'
              : `Upgrade ${selected.cost}`}
          </button>
        </div>
      )}
    </section>
  );
}
