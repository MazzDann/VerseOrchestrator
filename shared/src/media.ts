import { N_ } from './i18n/index.js';

/**
 * The system won't open a folder or a file of an album or a video (Mac check of 1.9.0): macOS
 * keeps Desktop, Documents, Downloads and removable or network disks from a program it hasn't
 * allowed (EPERM), plain rights refuse with EACCES. Not «not found» — the drive is there. The
 * server refuses an add by these keys; the control window tells them apart and, on a Mac, says
 * where to allow it (web/src/lib/denied.ts).
 */
export const FOLDER_DENIED = N_('Система не дає відкрити цю папку — перевірте права доступу.');
export const FILE_DENIED = N_('Система не дає відкрити цей файл — перевірте права доступу.');
