import { notifications } from '@mantine/notifications';
import { tr } from '../../i18n';

export const standbyNotice = () =>
  notifications.show({
    message: tr(
      'Показом керує інше вікно керування — натисніть «Взяти керування», щоб вести звідси',
    ),
    color: 'orange',
    autoClose: 2500,
  });
