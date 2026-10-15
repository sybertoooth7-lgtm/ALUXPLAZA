export type SupportedLanguage = 'en' | 'sw';

export const translations = {
  en: {
    language: 'Language',
    english: 'English',
    swahili: 'Kiswahili',
    clientPortal: 'Client Portal',
    signIn: 'Sign In',
    signingIn: 'Signing in…',
    createAccount: 'Create account',
    createAccountTitle: 'Create Account',
    companyName: 'Company Name',
    email: 'Email',
    password: 'Password',
    forgotPassword: 'Forgot password?',
    dashboard: 'Dashboard',
    logout: 'Logout',
    complianceActivity: 'Compliance and account activity',
    loadingCompliance: 'Loading your compliance status…',
    noComplianceItems: 'No compliance items on file yet.',
    accountLoginActivity: 'Account Login Activity',
    noLoginActivity: 'No login activity recorded yet.',
    successfulLogin: 'Successful login',
    failedLogin: 'Failed login attempt',
    notYetAssessed: 'Not yet assessed',
    inProgress: 'In progress',
    passing: 'Passing',
    needsAttention: 'Needs attention',
    notApplicable: 'Not applicable',
    privacyConsent:
      'I agree that Alux Plaza may use the details I provide to create and manage my account, as described in the Privacy Policy.',
    agreePrivacyRequired:
      'Please tick the box to agree to the Privacy Policy before creating an account.',
    invalidEmail: 'Please enter a valid email address.',
    enterPassword: 'Please enter your password.',
    accountCreated: 'Account created. Please verify your email.',
  },
  sw: {
    language: 'Lugha',
    english: 'Kiingereza',
    swahili: 'Kiswahili',
    clientPortal: 'Tovuti ya Mteja',
    signIn: 'Ingia',
    signingIn: 'Inaingia…',
    createAccount: 'Fungua akaunti',
    createAccountTitle: 'Fungua Akaunti',
    companyName: 'Jina la Kampuni',
    email: 'Barua pepe',
    password: 'Nenosiri',
    forgotPassword: 'Umesahau nenosiri?',
    dashboard: 'Dashibodi',
    logout: 'Toka',
    complianceActivity: 'Uzingatiaji wa viwango na shughuli za akaunti',
    loadingCompliance: 'Inapakia hali ya uzingatiaji wa viwango…',
    noComplianceItems: 'Bado hakuna vipengee vya uzingatiaji vilivyorekodiwa.',
    accountLoginActivity: 'Shughuli za Kuingia kwenye Akaunti',
    noLoginActivity: 'Bado hakuna shughuli za kuingia zilizorekodiwa.',
    successfulLogin: 'Kuingia kumefaulu',
    failedLogin: 'Jaribio la kuingia lililoshindwa',
    notYetAssessed: 'Bado haijatathminiwa',
    inProgress: 'Inaendelea',
    passing: 'Imekidhi',
    needsAttention: 'Inahitaji kuangaliwa',
    notApplicable: 'Haitumiki',
    privacyConsent:
      'Ninakubali Alux Plaza itumie maelezo ninayotoa kufungua na kusimamia akaunti yangu, kama ilivyoelezwa kwenye Sera ya Faragha.',
    agreePrivacyRequired:
      'Tafadhali tia alama kwenye kisanduku kukubali Sera ya Faragha kabla ya kufungua akaunti.',
    invalidEmail: 'Tafadhali weka anwani sahihi ya barua pepe.',
    enterPassword: 'Tafadhali weka nenosiri lako.',
    accountCreated: 'Akaunti imefunguliwa. Tafadhali thibitisha barua pepe yako.',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function translate(language: SupportedLanguage, key: TranslationKey): string {
  return translations[language][key] ?? translations.en[key];
}
