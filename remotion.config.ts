import {Config} from '@remotion/cli/config';

Config.setVideoSize(1920, 1080);
Config.setFrameRate(30);
Config.setEntryPoint('./remotion/index.tsx');
Config.setLogLevel('info');
Config.setCachingEnabled(true);
