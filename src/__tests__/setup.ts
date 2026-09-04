import { MotionGlobalConfig } from 'motion';

// Screen transitions use AnimatePresence mode="wait"; jsdom never finishes exit animations,
// so skip them in tests to keep navigation synchronous.
MotionGlobalConfig.skipAnimations = true;
