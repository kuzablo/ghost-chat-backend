/*
  [2.35.8] Единый источник картинки — /public/mascot.png.
           Убран импорт ../assets/mascot.png — два источника расходились.
*/
const Mascot = ({ size = 80, alt = 'banjoboy' }) => (
  <img
    src="/mascot.png"
    alt={alt}
    width={size}
    height={size}
    style={{
      display: 'block',
      margin: '0 auto 8px',
      imageRendering: 'pixelated',
    }}
    draggable={false}
  />
);

export default Mascot;