// Run live widgets on the keyboard screen (clock, system monitor, rotation).
//
//   node screen-widgets.js            # list available widgets
//   node screen-widgets.js clock      # stream the clock
//   node screen-widgets.js sysmon     # stream the system monitor
//   node screen-widgets.js rotate     # cycle through all widgets
import { listWidgets } from './src/widgets.js';
import { WidgetRunner } from './src/widget-runner.js';

const id = process.argv[2];

if (!id || id === '--help' || id === '-h') {
  console.log('Usage: node screen-widgets.js <widget|rotate>\n');
  console.log('Widgets:');
  for (const w of listWidgets()) console.log(`  ${w.id.padEnd(8)} ${w.name}  (every ${w.defaultIntervalMs}ms)`);
  console.log('  rotate   cycle through all widgets');
  process.exit(0);
}

const runner = new WidgetRunner();
runner.onError = (e) => console.error('render/push:', e.message);

try {
  const st = runner.start(id);
  console.log(`Streaming "${st.active}"${st.rotate ? ' (rotating)' : ''} to the screen. Ctrl-C to stop.`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

function shutdown() {
  console.log('\nstopping…');
  runner.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
