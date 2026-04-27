import QuickHomeView from '@quickCommerce/user/components/QuickHomeView';
import BRAND_THEME from "@/config/brandTheme";

export default function QuickSection(props) {
  return (
    <div className={BRAND_THEME.tokens.homepage.shared.pageBackground}>
      <QuickHomeView {...props} />
    </div>
  );
}
