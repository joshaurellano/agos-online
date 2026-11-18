
import early from '../assets/illustrations/during-early.svg';
import higher from '../assets/illustrations/during-higher.svg';
import wade from '../assets/illustrations/during-wade.svg';
import current from '../assets/illustrations/during-current.svg';
import power from '../assets/illustrations/during-power.svg';
import informed from '../assets/illustrations/during-informed.svg';

const SCENES = {
  early,
  higher,
  wade,
  current,
  power,
  informed,
};

export default function FloodStepArt({ id, label, className = '' }) {
  const image = SCENES[id];

  if (!image) return null;

  return (
    <img
      className={`kyz-art ${className}`.trim()}
      src={image}
      alt={label || ''}
      aria-hidden={label ? undefined : 'true'}
      draggable="false"
    />
  );
}
