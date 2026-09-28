import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../i18n/I18nContext";

/** يطابق تغليف main.tsx الحقيقي (I18nProvider + Router) — بدون هذا أي مكوّن يستخدم useI18n()
 *  أو useLocation()/useNavigate() يرمي خطأ فورًا خارج شجرة provider حقيقية. */
export function renderWithProviders(ui: ReactElement, { route = "/" }: { route?: string } = {}) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </I18nProvider>,
  );
}
