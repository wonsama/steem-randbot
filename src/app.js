////////////////////////////////////////////////////////////
//
// information (소개)
//

/*
  파일명 : app.js

  설명 : randbot application

  최초작성일 : 2022.03.05
*/

////////////////////////////////////////////////////////////
//
// require (라이브러리 로딩)
//
const fs = require("fs");
const moment = require("moment");
const { getBalance, vote, getStateWith } = require("./util/wsteem");
const { ROOT_PATH } = require("./util/wconst");
const { objToArr } = require("./util/warray");

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
async function start() {
  // dotenv, pm2 등과 같은 것을 통해 값을 셋팅하지 않아서
  // 아래와 같이 값을 메소드 내에서 초기화(process.env.xxx) 해야 됨에 유의한다
  const VOTING_ID = process.env.VOTING_ID;
  const VOTING_POSTING_KEY = process.env.VOTING_POSTING_KEY;
  const VOTING_LIMIT = process.env.VOTING_LIMIT;
  const VOTING_WEIGHT = process.env.VOTING_WEIGHT;

  // 대상 계정의 보팅 파워가 VOTING_LIMIT(9900) 이상일 경우
  let bal = await getBalance(VOTING_ID);
  console.log(bal);

  if (bal.vp > VOTING_LIMIT) {
    // 트랜드에서 타켓을 찾아 보팅을 수행한다
    let tran = await getStateWith("/trending");

    // 이미 보팅한 대상은 제거한다
    let targets = objToArr(tran.content).filter(
      (x) => x.active_votes.filter((y) => y.voter == VOTING_ID).length == 0
    );

    // 첫번째 항목을 보팅 수행
    if (targets.length > 0) {
      let t = targets[0];
      await vote(
        VOTING_POSTING_KEY,
        VOTING_ID,
        t.author,
        t.permlink,
        VOTING_WEIGHT
      );

      // 보팅 경과를 logs 폴더에 기록한다
      let votedPath = `${ROOT_PATH}/logs/voted-${moment().format(
        "YYYYMMDD"
      )}.json`;
      let voted = fs.existsSync(votedPath) ? require(votedPath) : [];
      voted.push({
        author: t.author,
        permlink: t.permlink,
        url: `https://steemit.com${t.url}`,
        created: t.created,
      });
      fs.writeFileSync(votedPath, JSON.stringify(voted, null, 2));
    }
  }

  // 단, 이미 보팅을 수행한 경우에는 보팅을 하지 않는다
}

////////////////////////////////////////////////////////////
//
// exports (외부 노출 함수 지정)
//

module.exports = {
  start,
};
