import Constants from 'expo-constants';

const isProduction = !__DEV__;

// API URLs
// const DEV_API_URL = "http://172.26.226.23:8000/api/v1";
// const PROD_API_URL = "http://172.26.226.23:8000/api/v1";
const DEV_API_URL = "http://10.20.254.23:8000/api/v1";
const PROD_API_URL = "https://fourthbook.niveel.com/api/v1";
const DEV_PAYMENT_CALLBACK_URL = "thefourthbook://payments/callback";
const PROD_PAYMENT_CALLBACK_URL = "thefourthbook://payments/callback";

export const API_BASE_URL = isProduction ? PROD_API_URL : DEV_API_URL;
export const PAYMENT_CALLBACK_URL = isProduction ? PROD_PAYMENT_CALLBACK_URL : DEV_PAYMENT_CALLBACK_URL;

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
const googleOAuth = (extra.googleOAuth ?? {}) as Record<string, string | undefined>;

export const GOOGLE_ANDROID_CLIENT_ID = googleOAuth.androidClientId ?? '';
export const GOOGLE_IOS_CLIENT_ID = googleOAuth.iosClientId ?? '';
export const GOOGLE_WEB_CLIENT_ID = googleOAuth.webClientId ?? '';
