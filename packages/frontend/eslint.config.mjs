import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // `eslint-config-next` imposta `react.version: 'detect'`, e la rilevazione
    // di `eslint-plugin-react` passa da `context.getFilename()`, rimosso in
    // ESLint 10: il lint muore con "contextOrFilename.getFilename is not a
    // function" prima ancora di analizzare un file. Dichiarare la versione salta
    // del tutto la rilevazione — da tenere allineata a `react` in package.json.
    settings: { react: { version: '19.2' } },
    rules: {
      // Stessa convenzione del config di root: il prefisso `_` dichiara un
      // parametro tenuto per posizione e volutamente non usato.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]

export default eslintConfig
