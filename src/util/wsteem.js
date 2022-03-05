////////////////////////////////////////////////////////////
//
// information (소개)
//

/*
  파일명 : wsteem.js

  설명 : 스팀 wraper 유틸

  최초작성일 : 2022.03.03
*/

////////////////////////////////////////////////////////////
//
// require (라이브러리 로딩)
//
const steem = require("steem");
const { sleep, time } = require("./wetc");
const { objToArr } = require("./warray");
const { rpcSend } = require("./wrpc");
const API_URL = process.env.API_URL || "https://api.steemit.com";
steem.api.setOptions({ url: API_URL }); // default 가 https://steemd.steemit.com 라서 반드시 재 설정 해야 됨

////////////////////////////////////////////////////////////
//
// const (상수정의)
//
const MAX_RETRY = process.env.MAX_RETRY || 3;

////////////////////////////////////////////////////////////
//
// let (변수정의)
//

////////////////////////////////////////////////////////////
//
// private function (비공개 함수) 함수명을 _(언더스코어) 로 시작
//

/**
 * API 호출 오류 시 재 호출 처리를 수행한다
 * @param {Function} fn 호출 함수
 * @param {string} alias 별칭
 * @param {number} retry 재시도 횟수
 * @param  {...any} params 파라미터 목록
 * @returns Promise
 */
async function _recall(fn, alias = "not_defined", retry = 0, ...params) {
  alias = alias == "not_defined" ? fn.name : alias;
  try {
    let res;
    if (params) {
      res = await fn(...params);
    } else {
      res = await fn();
    }
    return res;
  } catch (err) {
    retry++;
    if (retry > MAX_RETRY) {
      throw new Error(`${alias} retry over ${MAX_RETRY}`); // fn.name 이 ret 이런식이라 그냥 식별용 alias 를 사용하기로 함.
    }
    await sleep();
    console.error(`${alias} is recalled : ${retry}`, err.toString());
    return _recall(fn, alias, retry, ...params);
  }
}

async function _recallRpc(method, params, retry = 0) {
  try {
    return await rpcSend(method, params);
  } catch (err) {
    retry++;
    if (retry > MAX_RETRY) {
      throw new Error(`${method} retry over ${MAX_RETRY}`);
    }
    await sleep();
    console.error(`${method} is recalled : ${retry}`, err.toString());
    return _recallRpc(method, params, retry);
  }
}

/**
 * 입력받은 값에서 공백으로 나눈 이후 처음 값을 추출한다
 * @param {string} source 입력 문자열
 * @returns number
 */
function _calc(source) {
  return parseFloat(source.split(" ")[0]);
}

/**
 * 계정정보를 가지고 보팅 파워를 계산한다
 * 10000 이 최대임
 * @param {Object} accInfo 계정 정보
 * @return {number} 보팅파워
 */
function _calcVp(accInfo) {
  const MAX_VOTING_POWER = 10000;
  const CHARGE_PER_SEC = 60 * 60 * 24 * 5; // 432000, 1초당 충전되는 수치, *5는 하루 20% 1/5을 의미함

  // 보팅파워를 반환한다
  const last = accInfo.voting_power; //최근 투표일 기준 보팅파워 , 10000 is max
  const gap =
    (new Date().getTime() - new Date(accInfo.last_vote_time + "Z").getTime()) /
    1000; // 최종 보팅한 이후 흐른 시간, 초
  const vp = Math.min(
    MAX_VOTING_POWER,
    parseInt(last + (gap / CHARGE_PER_SEC) * MAX_VOTING_POWER)
  ); // 시간차를 적용한 현재 보팅파워 10000 is max
  return vp;
}

/**
 * RC정보를 파싱
 * ratio : 10000 이 최대, curr 현재, max 최대치
 * @param {Object} rcInfo RC 정보
 * @return {number} RC정보
 */
function _calcRc(rcInfo) {
  const MILLISEC = 1000;
  const CHARGE_PER_SEC = 60 * 60 * 24 * 5; // 432000, 1초당 충전되는 수치, *5는 하루 20% 1/5을 의미함
  const r = rcInfo.rc_accounts[0];

  const curr_mana = parseInt(r.rc_manabar.current_mana); // 현재 마나
  const max_mana = parseInt(r.max_rc); // 최대 마나
  const per_sec = parseFloat(max_mana / CHARGE_PER_SEC); // 1초당 차오르는 마나, * 5 는 하루 20% 1/5 을 의미함
  const prev_tm = parseInt(r.rc_manabar.last_update_time); // 최종 엑션 기준 시간
  const now_tm = parseInt(new Date().getTime() / MILLISEC); // 현재 시간
  const gap = parseInt(now_tm - prev_tm); // 시간 차이
  const mod_mana = Math.min(
    parseInt(per_sec * gap) + parseInt(curr_mana),
    max_mana
  ); // 수정된 현재 마나

  return {
    ratio: Math.floor((mod_mana * 1e4) / max_mana),
    curr: curr_mana,
    max: max_mana,
  };
}

/**
 * 입력받은 값을 가지고 스팀파워를 계산한다
 * @param {Object} accInfo 계정 정보
 * @param {Object} vpInfo 전역 설정정보
 */
function _calcSp(accInfo, vpInfo) {
  const tvs = _calc(vpInfo.total_vesting_shares); // totalVestingShares
  const tvfs = _calc(vpInfo.total_vesting_fund_steem); // totalVestingFundSteem
  const r = accInfo;

  // 스파는 소숫점에서 반올림 처리임에 유의
  const _sp = (vest) =>
    parseFloat(steem.formatter.vestToSteem(_calc(vest), tvs, tvfs).toFixed(0));

  return {
    original: _sp(r.vesting_shares), // 내것
    received: _sp(r.received_vesting_shares), // 임대 받은것
    delegated: _sp(r.delegated_vesting_shares), // 임대 해준것
    current:
      _sp(r.vesting_shares) +
      _sp(r.received_vesting_shares) -
      _sp(r.delegated_vesting_shares), // 현재 스파
  };
}

////////////////////////////////////////////////////////////
//
// public function (공개 함수)
//

/**
 * 입력받은 블록목록 정보에서 operations 정보만 추출한다
 * @param {Object[]} blocks 블록정보
 */
function getOperations(blocks) {
  // CHECK : virtual block
  // 가상 블록은 다른 방식으로 가져와야 됨에 유의
  let operations = [];
  for (let b of blocks) {
    let block_timestamp = b.timestamp;
    let block_timestamp_kr = time(block_timestamp);
    let block_id = b.block_id;

    for (let t of b.transactions) {
      let block_num = t.block_num;
      let transaction_num = t.transaction_num;
      let transaction_id = t.transaction_id;

      for (let o of t.operations) {
        let operation_type = o[0];
        let operation_data = o[1];

        operations.push({
          block_timestamp_kr,
          block_timestamp,
          block_id,
          block_num,
          transaction_id,
          transaction_num,
          operation_type,
          operation_data,
        });
      }
    }
  }

  // 정렬 : block_num asc, transaction_num asc
  operations.sort((a, b) => {
    if (a.block_num == b.block_num) {
      return a.transaction_num - b.transaction_num;
    }
    return a.block_num - b.block_num;
  });

  return operations;
}

/**
 * 보팅을 수행한다
 * @param {string} wif 보팅 계정 포스팅키
 * @param {string} voter 보팅 계정명
 * @param {string} author 보팅 할 글의 author
 * @param {string} permlink 보팅 할 글의 permlink
 * @param {number} weight 보팅 weight, 10000(1e4) 이 100%임
 * @returns Promise
 */
async function vote(wif, voter, author, permlink, weight = 1e4) {
  return await _recall(
    steem.broadcast.vote,
    "voteAsync",
    0,
    wif,
    voter,
    author,
    permlink,
    weight
  );
}

/**
 * 컨텐츠 정보를 가져온다
 * @param {string} author 계정명
 * @param {string} permlink 영구링크
 * @param {string} voter 보팅사용자, 해당 사용자가 보팅을 했는지 여부를 파악하기 위함
 * @returns Promise
 */
async function getContent(author, permlink, voter = "-1") {
  let res = await _recall(
    steem.api.getContentAsync,
    "getContent",
    0,
    author,
    permlink
  );
  // added
  // voted : voter 가 해당 글에 보팅 했는지 여부
  // changed : 컨텐츠 수정여부
  let voted =
    res.active_votes.filter((x) => x.voter == voter).length == 0 ? false : true;
  return { ...res, changed: res.created !== res.last_update, voted, voter };
}

/**
 * 최신 블록 정보를 반환한다
 * @param {boolean} is_head 해드 블록여부, 기본 true
 * @returns number
 */
async function getBlockHeader(is_head = true) {
  let res = await getDynamicGlobalProperties();
  return is_head ? res.head_block_number : res.last_irreversible_block_num;
}

/**
 * 블록 정보를 가져온다
 * @param {number} block_num 블록번호
 * @returns Promise
 */
async function getBlock(block_num) {
  return await _recall(steem.api.getBlockAsync, "getBlock", 0, block_num);
}

/**
 * 블록 목록정보를 가져온다
 * 200개 정도를 한번에 읽으면 반드시 3초 이상 SLEEP 을 해야 됨에 유의
 * @param {number} start_block
 * @param {number} end_block
 * @returns Promise
 */
async function getBlocks(start_block, end_block) {
  let blocks = [];
  if (!end_block) {
    end_block = start_block;
  }
  for (let i = start_block; i <= end_block; i++) {
    blocks.push(getBlock(i));
  }
  return Promise.all(blocks);
}

/**
 * 경로 기준 다양한 정보를 가져온다(테스트 후 사용 바람)
 * CHECK : Account History 를 통해 가져 올 수도 있음
 * 쓴글(동작안함) : /@username/posts
 * 쓴글 : /@username (최근 20개 가져옴), 최신이 0 가장오래된 19
 * 특정 글 : /@username/permlink-of-post
 * 작성한댓글 : /@username/comments
 * 받은댓글 : /@username/recent-replies
 * 트랜드 : /trending
 * 트랜드-카테고리 : /trending/collorchallenge
 * 기타 등등
 * @param {string} path 경로 정보
 * @returns Promise
 */
async function getStateWith(path) {
  return await _recall(steem.api.getStateWithAsync, "getStateWith", 0, {
    path,
  });
}

/**
 * 최근 컨텐츠 정보 1개를 반환한다
 * @param {String} username 계정명
 * @returns Promise
 */
async function getRecentContent(username) {
  username = username.replace("@", "");
  let c = await getStateWith(`/@${username}`);
  let items = objToArr(c.content);
  items.sort((a, b) => b.post_id - a.post_id);
  return items[0];
}

/**
 * 블록 정보를 가져온다
 * @param {number} block_num 블록번호
 * @returns Promise
 */
async function getBlock(block_num) {
  return await _recall(steem.api.getBlockAsync, "getBlock", 0, block_num);
}

/**
 * 계정 목록 정보를 반환한다
 * @param {Array} names 계정목록
 * @returns Promise
 */
async function getAccounts(names) {
  return await _recall(steem.api.getAccountsAsync, "getBlock", 0, names);
}

/**
 * 전역 설정 정보를 반환한다
 * @returns Promise
 */
async function getDynamicGlobalProperties() {
  return await _recall(
    steem.api.getDynamicGlobalPropertiesAsync,
    "getDynamicGlobalPropertiesAsync",
    0
  );
}

/**
 * 계정 정보를 반환한다
 * @param {string} name 계정명
 * @returns Promise
 */
async function getAccount(name) {
  let res = await getAccounts([name]);
  return res.length == 0 ? {} : res[0];
}

/**
 * 계정명 기준 잔고 정보를 반환한다
 * vp, rc, sp, sbd, steem
 * @param {string} name 계정명
 */
async function getBalance(name) {
  let res = await Promise.all([
    getAccount(name), // 계정 정보를 가져온다
    _recallRpc("rc_api.find_rc_accounts", {
      accounts: [name],
    }), // RC 정보를 가져온다
    getDynamicGlobalProperties(),
  ]);

  let r = res[0];
  let vp = _calcVp(res[0]); // VP(voting power)
  let rc = _calcRc(res[1]); // RC(resource credit)
  let sp = _calcSp(res[0], res[2]); // SP(steem power)
  let sbd = _calc(r.sbd_balance);
  let steem = _calc(r.balance);

  return { vp, rc, sp, sbd, steem };
}

/**
 * 계정의 보상을 청구한다
 * @param {string} account 계정명
 * @param {string} wif postingkey
 */
async function claimRewardBalance(account, wif) {
  let res = await getAccount(account);
  if (
    _calc(res.reward_steem_balance) == 0 &&
    _calc(res.reward_sbd_balance) == 0 &&
    _calc(res.reward_vesting_balance) == 0
  ) {
    return { result: "is not claimed" };
  }

  return await _recall(
    steem.broadcast.claimRewardBalanceAsync,
    "claimRewardBalanceAsync",
    0,
    wif,
    account,
    res.reward_steem_balance,
    res.reward_sbd_balance,
    res.reward_vesting_balance
  );
}

////////////////////////////////////////////////////////////
//
// exports (외부 노출 함수 지정)
//

module.exports = {
  getBlockHeader,
  getDynamicGlobalProperties,
  getBlock,
  getBlocks,
  getOperations,
  getContent,
  vote,
  getStateWith,
  getRecentContent,
  getAccounts,
  getAccount,
  getBalance,
  claimRewardBalance,
};
