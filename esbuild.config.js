import esbuild from 'esbuild';
import babel from 'esbuild-plugin-babel';

await esbuild.build({
  entryPoints: ['node_modules/@emurgo/cardano-serialization-lib-asmjs/cardano_serialization_lib.js'],
  bundle: true,
  platform: 'neutral',
  minify: true,
  outfile: 'cardano.asm.js',
  plugins: [babel({
    config: {
      presets: [['@babel/preset-env', {
        modules: false,
      }]],
      compact: false,
      targets: 'defaults',
    },
  })],
  // for esbuild
  target: ['es5'],
});
