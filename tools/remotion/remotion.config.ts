import {Config} from '@remotion/cli/config';

Config.overrideWidth(1920);
Config.overrideHeight(1080);
Config.overrideFps(30);
Config.setEntryPoint('./index.tsx');
Config.setLogLevel('info');
Config.setCachingEnabled(true);
