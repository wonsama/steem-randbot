////////////////////////////////////////////////////////////
//
// information (소개)
//

/*
  파일명 : wrpc

  설명 : rpc 통신을 수행한다. steem 라이브러리에 없는 일부 매소드를 처리하기 위해 생성

  최초작성일 : 2022.03.05
*/

////////////////////////////////////////////////////////////
//
// require (라이브러리 로딩)
//
const axios = require("axios");

////////////////////////////////////////////////////////////
//
// const (상수정의)
//
const API_URL = process.env.API_URL || "https://api.steemit.com";

////////////////////////////////////////////////////////////
//
// let (변수정의)
//

////////////////////////////////////////////////////////////
//
// private function (비공개 함수) 함수명을 _(언더스코어) 로 시작
//

////////////////////////////////////////////////////////////
//
// public function (공개 함수)
//

/**
 * RPC 2.0 통신 모델 생성
 * @param {string} method 호출 메소드
 * @param {string} params 전송 파라미터
 * @param {number} id 아이디 (수신 시 동일 id 값을 리턴해준다)
 * @returns Object
 */
function rpc20(method, params, id = 1) {
  let json = {};
  json.jsonrpc = "2.0";
  json.method = method;
  if (params) {
    json.params = params;
  }
  json.id = id;

  return json;
}

/**
 * RPC20 으로 대상에게 통신을 수행한다
 * @param {string} method 통신 메소드
 * @param {Object} params 전송 파라미터
 * @param {string} url 통신 주소
 * @param {number} id id 아이디 (수신 시 동일 id 값을 리턴해준다)
 * @returns Promise
 */
async function rpcSend(method, params, url = API_URL, id = 1) {
  let res = await axios.post(url, rpc20(method, params), {
    headers: {
      "Content-Type": "application/json",
    },
  });

  return res.data.result;
}

////////////////////////////////////////////////////////////
//
// exports (외부 노출 함수 지정)
//

module.exports = {
  rpc20,
  rpcSend,
};
