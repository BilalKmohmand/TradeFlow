import { MotionGlobalConfig } from 'motion';

// Screen transitions use AnimatePresence mode="wait"; jsdom never finishes exit animations,
// so skip them in tests to keep navigation synchronous.
MotionGlobalConfig.skipAnimations = true;

// jsdom has no Blob URLs; the backup/CSV download helpers call these.
if (!URL.createObjectURL) (URL as any).createObjectURL = () => 'blob:test';
if (!URL.revokeObjectURL) (URL as any).revokeObjectURL = () => {};
