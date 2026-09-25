import OrbitNotification from './OrbitNotification';

/*
  [2.48.7] instantHide — при открытии модалок маскот пропадает мгновенно,
           без 240мс transition. paused — не крутим RAF в скрытом состоянии.
  [2.39.4] Компонент всегда в DOM. Видимость — через класс
           .pm-orbit--preparing. Ref валиден всегда.
*/
const PrivateMessageToasts = ({
  users = [],
  visible = false,
  instantHide = false,
  onOpenDialogs,
  mascotRef = null,
}) => {
  const hasUsers = users.length > 0;

  const cls = visible
    ? ''
    : `pm-orbit--preparing${instantHide ? ' pm-orbit--instant' : ''}`;

  return (
    <OrbitNotification
      users={users}
      mascotOnly={!hasUsers}
      paused={!visible}
      onClick={visible && hasUsers ? onOpenDialogs : undefined}
      className={cls}
      mascotRef={mascotRef}
    />
  );
};

export default PrivateMessageToasts;