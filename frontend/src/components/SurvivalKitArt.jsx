import docs from '../assets/illustrations/survival-kit-icons/docs.png';
import meds from '../assets/illustrations/survival-kit-icons/meds.png';
import phone from '../assets/illustrations/survival-kit-icons/phone.png';
import water from '../assets/illustrations/survival-kit-icons/water.png';
import contacts from '../assets/illustrations/survival-kit-icons/contacts.png';
import baby from '../assets/illustrations/survival-kit-icons/baby.png';
import care from '../assets/illustrations/survival-kit-icons/care.png';
import senior from '../assets/illustrations/survival-kit-icons/senior.png';
import pet from '../assets/illustrations/survival-kit-icons/pet.png';
import food from '../assets/illustrations/survival-kit-icons/food.png';
import light from '../assets/illustrations/survival-kit-icons/light.png';
import firstaid from '../assets/illustrations/survival-kit-icons/firstaid.png';
import hygiene from '../assets/illustrations/survival-kit-icons/hygiene.png';
import cash from '../assets/illustrations/survival-kit-icons/cash.png';
import warm from '../assets/illustrations/survival-kit-icons/warm.png';
import rain from '../assets/illustrations/survival-kit-icons/rain.png';

const ART = { docs, meds, phone, water, contacts, baby, care, senior, pet, food, light, firstaid, hygiene, cash, warm, rain };

export default function SurvivalKitArt({ id }) {
  const src = ART[id];
  if (!src) return null;

  return (
    <img
      className="kyz-kit-art"
      src={src}
      alt=""
      aria-hidden="true"
      draggable="false"
      style={{
        width: 64,
        height: 64,
        flex: '0 0 64px',
        objectFit: 'contain',
        borderRadius: 12,
      }}
    />
  );
}
