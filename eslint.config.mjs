import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [{ ignores: ['.release-local/**', '.release-private/**', '.phase8-audit/**'] }, ...nextCoreWebVitals];

export default eslintConfig;
