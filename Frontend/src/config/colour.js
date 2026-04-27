import BRAND_THEME from "./brandTheme";

const colour = {
  primaryBlue: BRAND_THEME.colors.brand.primary,
  darkBlue: BRAND_THEME.colors.brand.primaryDark,
  accentRed: BRAND_THEME.colors.brand.accentRed,
  softRed: BRAND_THEME.colors.brand.accentRedSoft,
  background: BRAND_THEME.tokens.app.pageBackground,
  card: BRAND_THEME.tokens.app.cardBackground,
  text: BRAND_THEME.tokens.app.primaryText,
  secondaryText: BRAND_THEME.tokens.app.secondaryText,
  success: BRAND_THEME.colors.semantic.success,
  successDark: BRAND_THEME.colors.semantic.successDark,
  border: BRAND_THEME.tokens.app.border,
};

export default colour;
export { colour };
