import { ExtractJwt } from 'passport-jwt';

/** 인증과 속도 제한이 같은 토큰을 보도록 한 곳에서 추출합니다. 스킴의 대소문자를 구분하지 않습니다. */
export const extractBearerToken = ExtractJwt.fromAuthHeaderAsBearerToken();
