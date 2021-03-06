////////////////////////////////////////////////////////////
//
// information (소개)
//

/*
  파일명 : steem-randbot.js

  설명 : 진입점

  최초작성일 : 2022.03.05
*/

////////////////////////////////////////////////////////////
//
// require (라이브러리 로딩)
//
const env = require("./steem-randbot.config");
const { start } = require("./src/app");

////////////////////////////////////////////////////////////
//
// const (상수정의)
//

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

// 즉시 실행 함수 수행
(async () => {
  // process.env append
  process.env = { ...process.env, ...env };

  // start app
  start();
})();

////////////////////////////////////////////////////////////
//
// exports (외부 노출 함수 지정)
//

// module.exports = {};
