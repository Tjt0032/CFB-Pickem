"use strict";

/* Every number on the page is derived from data.json. */

const PLAYER_COLORS = {
  Tyler: "#5aa9ff",
  Tatum: "#ff6f61",
  Abigail: "#c792ff",
};
const FALLBACK_COLORS = ["#f2c14e", "#3ddc97", "#ff9f43", "#7aa2ff"];

const ui = {
  week: null,
  splitsOnly: false,
  spoilersOpen: false,
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function colorFor(name) {
  if (PLAYER_COLORS[name]) return PLAYER_COLORS[name];
  let hash = 0;
  const text = String(name);
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i) * (i + 1)) % FALLBACK_COLORS.length;
  return FALLBACK_COLORS[hash];
}

function isDecided(game) {
  return game.winner != null && game.winner !== "";
}

function weekDate(data, week) {
  if (!data.weekDates) return null;
  return data.weekDates[String(week)] || null;
}

function formatDate(iso) {
  if (!iso) return "";
  const parts = String(iso).split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return "";
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function pctLabel(part, whole) {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function widthOf(part, whole) {
  if (!whole) return "0%";
  const value = Math.max(0, Math.min(100, (part / whole) * 100));
  return `${value.toFixed(1)}%`;
}

function listNamesHtml(names) {
  const safe = names.map(esc);
  if (safe.length === 0) return "";
  if (safe.length === 1) return safe[0];
  if (safe.length === 2) return `${safe[0]} and ${safe[1]}`;
  return `${safe.slice(0, -1).join(", ")}, and ${safe[safe.length - 1]}`;
}

function weekRangeShort(from, to) {
  if (from === to) return `W${from}`;
  return `W${from}–${to}`;
}

function rankedTeams(obj) {
  return Object.entries(obj)
    .map(([team, count]) => ({ team, count }))
    .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team));
}

function maxTied(rows) {
  if (!rows.length) return [];
  return rows.filter((row) => row.count === rows[0].count);
}

function leadersOf(map, players) {
  const max = Math.max(...players.map((p) => map[p]));
  return { names: players.filter((p) => map[p] === max), max };
}

function playerSpan(name) {
  return `<span class="who" style="--pc:${colorFor(name)}"><i aria-hidden="true"></i>${esc(name)}</span>`;
}

function computeStats(data) {
  const players = data.players.slice();
  const games = data.games || [];
  const decided = games.filter(isDecided);
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);

  const totals = Object.fromEntries(players.map((p) => [p, { correct: 0, games: 0, pct: 0 }]));
  for (const game of decided) {
    for (const player of players) {
      totals[player].games += 1;
      if (game.picks && game.picks[player] === game.winner) totals[player].correct += 1;
    }
  }
  for (const player of players) {
    totals[player].pct = totals[player].games ? totals[player].correct / totals[player].games : 0;
  }

  const maxCorrect = players.length ? Math.max(...players.map((p) => totals[p].correct)) : 0;
  const leaderNames = players.filter((p) => totals[p].correct === maxCorrect);
  const margins = {};
  for (const player of players) {
    if (!leaderNames.includes(player)) margins[player] = maxCorrect - totals[player].correct;
  }

  const sorted = players.slice().sort((a, b) => (
    totals[b].correct - totals[a].correct || players.indexOf(a) - players.indexOf(b)
  ));
  const ranking = [];
  sorted.forEach((player, index) => {
    const rank = index === 0 || totals[player].correct !== totals[sorted[index - 1]].correct
      ? index + 1
      : ranking[index - 1].rank;
    ranking.push({
      player,
      rank,
      correct: totals[player].correct,
      games: totals[player].games,
      pct: totals[player].pct,
      behind: maxCorrect - totals[player].correct,
    });
  });

  const weekly = [];
  const cumulative = [];
  const running = Object.fromEntries(players.map((p) => [p, 0]));
  for (const week of weeks) {
    const slate = decided.filter((g) => g.week === week);
    if (!slate.length) continue;
    const scores = {};
    for (const player of players) {
      const correct = slate.filter((g) => g.picks && g.picks[player] === g.winner).length;
      scores[player] = { correct, games: slate.length, pct: correct / slate.length };
      running[player] += correct;
    }
    const best = Math.max(...players.map((p) => scores[p].correct));
    weekly.push({
      week,
      date: weekDate(data, week),
      games: slate.length,
      scores,
      winners: players.filter((p) => scores[p].correct === best),
      perfect: players.filter((p) => scores[p].correct === slate.length),
    });
    cumulative.push({
      week,
      totals: Object.fromEntries(players.map((p) => [p, running[p]])),
    });
  }

  const leadTimeline = cumulative.map((row) => {
    const best = Math.max(...players.map((p) => row.totals[p]));
    return {
      week: row.week,
      leaders: players.filter((p) => row.totals[p] === best),
      total: best,
    };
  });

  let unanimous = 0;
  let split = 0;
  let allCorrect = 0;
  let allWrong = 0;
  let lowerSideWins = 0;
  const splitWins = Object.fromEntries(players.map((p) => [p, 0]));
  const soleCorrect = Object.fromEntries(players.map((p) => [p, 0]));
  const soleWrong = Object.fromEntries(players.map((p) => [p, 0]));
  const lonePicks = Object.fromEntries(players.map((p) => [p, 0]));
  const pairwise = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      pairwise.push({
        a: players[i],
        b: players[j],
        agree: 0,
        bothRight: 0,
        aOnly: 0,
        bOnly: 0,
      });
    }
  }

  const allMiss = [];
  const upsetCalls = [];
  const spoilerPicks = {};
  const spoilerGames = {};

  for (const game of decided) {
    const picks = players.map((p) => (game.picks ? game.picks[p] : undefined));
    const unique = new Set(picks);
    const correctPlayers = players.filter((p) => game.picks && game.picks[p] === game.winner);
    const wrongPlayers = players.filter((p) => !game.picks || game.picks[p] !== game.winner);

    if (unique.size === 1) {
      unanimous += 1;
      if (correctPlayers.length === players.length) allCorrect += 1;
      if (correctPlayers.length === 0) allWrong += 1;
    } else {
      split += 1;
      for (const player of correctPlayers) splitWins[player] += 1;
    }

    if (correctPlayers.length === 1) {
      const caller = correctPlayers[0];
      soleCorrect[caller] += 1;
      const other = players.find((p) => p !== caller);
      upsetCalls.push({
        week: game.week,
        away: game.away,
        home: game.home,
        winner: game.winner,
        caller,
        against: other ? game.picks[other] : null,
      });
    }
    if (wrongPlayers.length === 1) soleWrong[wrongPlayers[0]] += 1;

    for (const player of players) {
      const others = players.filter((p) => p !== player);
      if (others.length && others.every((p) => game.picks && game.picks[p] !== game.picks[player])) {
        lonePicks[player] += 1;
      }
    }

    if (players.length && wrongPlayers.length === players.length) {
      allMiss.push({
        week: game.week,
        away: game.away,
        home: game.home,
        winner: game.winner,
        picked: game.picks ? game.picks[players[0]] : null,
      });
    }

    if (wrongPlayers.length) {
      spoilerPicks[game.winner] = (spoilerPicks[game.winner] || 0) + wrongPlayers.length;
      spoilerGames[game.winner] = (spoilerGames[game.winner] || 0) + 1;
    }

    const tally = {};
    for (const player of players) {
      const pick = game.picks ? game.picks[player] : undefined;
      if (pick) tally[pick] = (tally[pick] || 0) + 1;
    }
    const sides = [game.home, game.away].map((team) => ({ team, votes: tally[team] || 0 }));
    sides.sort((a, b) => a.votes - b.votes || String(a.team).localeCompare(String(b.team)));
    if (sides[0] && sides[1] && sides[0].votes < sides[1].votes && game.winner === sides[0].team) {
      lowerSideWins += 1;
    }

    for (const row of pairwise) {
      const pickA = game.picks ? game.picks[row.a] : undefined;
      const pickB = game.picks ? game.picks[row.b] : undefined;
      if (pickA === pickB) {
        row.agree += 1;
        if (pickA === game.winner) row.bothRight += 1;
      } else if (pickA === game.winner) row.aOnly += 1;
      else if (pickB === game.winner) row.bOnly += 1;
    }
  }

  const spoilers = Object.keys(spoilerPicks)
    .map((team) => ({ team, picks: spoilerPicks[team], games: spoilerGames[team] }))
    .sort((a, b) => b.picks - a.picks || b.games - a.games || a.team.localeCompare(b.team));

  const perfectWeeks = Object.fromEntries(players.map((p) => [
    p,
    weekly.filter((row) => row.perfect.includes(p)).map((row) => row.week),
  ]));

  let homeWins = 0;
  const homeAway = Object.fromEntries(players.map((p) => [p, {
    homePicks: 0,
    homeCorrect: 0,
    awayPicks: 0,
    awayCorrect: 0,
    seasonHome: 0,
    seasonAway: 0,
  }]));
  for (const game of decided) {
    if (game.winner === game.home) homeWins += 1;
    for (const player of players) {
      const pick = game.picks ? game.picks[player] : undefined;
      if (pick === game.home) {
        homeAway[player].homePicks += 1;
        if (pick === game.winner) homeAway[player].homeCorrect += 1;
      } else if (pick === game.away) {
        homeAway[player].awayPicks += 1;
        if (pick === game.winner) homeAway[player].awayCorrect += 1;
      }
    }
  }
  for (const game of games) {
    for (const player of players) {
      const pick = game.picks ? game.picks[player] : undefined;
      if (pick === game.home) homeAway[player].seasonHome += 1;
      else if (pick === game.away) homeAway[player].seasonAway += 1;
    }
  }

  const conferences = Object.entries(data.conferences || {}).map(([name, teams]) => {
    const set = new Set(teams);
    const slate = decided.filter((g) => set.has(g.home) || set.has(g.away));
    const byPlayer = {};
    for (const player of players) {
      let made = 0;
      let correct = 0;
      for (const game of slate) {
        const pick = game.picks ? game.picks[player] : undefined;
        if (pick !== game.home && pick !== game.away) continue;
        made += 1;
        if (pick === game.winner) correct += 1;
      }
      byPlayer[player] = { correct, made, pct: made ? correct / made : 0 };
    }
    return { name, teams: teams.slice(), games: slate.length, byPlayer };
  });

  const streaks = {};
  for (const player of players) {
    const seq = decided.map((game) => ({
      ok: Boolean(game.picks) && game.picks[player] === game.winner,
      week: game.week,
      away: game.away,
      home: game.home,
    }));
    let best = 0;
    let bestStart = 0;
    let bestEnd = -1;
    let currentRun = 0;
    let currentStart = 0;
    let missBest = 0;
    let missStart = 0;
    let missEnd = -1;
    let missRun = 0;
    let missRunStart = 0;
    seq.forEach((row, index) => {
      if (row.ok) {
        if (currentRun === 0) currentStart = index;
        currentRun += 1;
        if (currentRun > best) {
          best = currentRun;
          bestStart = currentStart;
          bestEnd = index;
        }
        missRun = 0;
      } else {
        if (missRun === 0) missRunStart = index;
        missRun += 1;
        if (missRun > missBest) {
          missBest = missRun;
          missStart = missRunStart;
          missEnd = index;
        }
        currentRun = 0;
      }
    });
    let current = 0;
    let currentIndex = seq.length;
    for (let i = seq.length - 1; i >= 0; i -= 1) {
      if (!seq[i].ok) break;
      current += 1;
      currentIndex = i;
    }
    streaks[player] = {
      best,
      bestStart: best ? seq[bestStart] : null,
      bestEnd: best ? seq[bestEnd] : null,
      current,
      currentStart: current ? seq[currentIndex] : null,
      currentEnd: current ? seq[seq.length - 1] : null,
      longestMiss: missBest,
      missStart: missBest ? seq[missStart] : null,
      missEnd: missBest ? seq[missEnd] : null,
    };
  }

  function bestWorst(player) {
    let best = null;
    let worst = null;
    let cleanest = null;
    for (const row of weekly) {
      const score = row.scores[player];
      const record = {
        week: row.week,
        date: row.date,
        correct: score.correct,
        games: score.games,
        pct: score.pct,
        misses: score.games - score.correct,
      };
      if (!best || score.pct > best.pct || (score.pct === best.pct && score.correct > best.correct)) best = record;
      if (!worst || score.pct < worst.pct || (score.pct === worst.pct && score.correct < worst.correct)) worst = record;
      if (!cleanest || record.misses < cleanest.misses || (record.misses === cleanest.misses && score.pct > cleanest.pct)) {
        cleanest = record;
      }
    }
    return { best, worst, cleanest };
  }

  const teams = {};
  for (const player of players) {
    const right = {};
    const wrong = {};
    const picked = {};
    const burned = {};
    for (const game of decided) {
      const pick = game.picks ? game.picks[player] : undefined;
      if (!pick) continue;
      picked[pick] = (picked[pick] || 0) + 1;
      if (pick === game.winner) right[pick] = (right[pick] || 0) + 1;
      else {
        wrong[pick] = (wrong[pick] || 0) + 1;
        burned[game.winner] = (burned[game.winner] || 0) + 1;
      }
    }
    const locks = Object.keys(right)
      .filter((team) => right[team] >= 4 && !wrong[team])
      .map((team) => ({ team, count: right[team] }))
      .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team));
    const pickedRows = rankedTeams(picked);
    const pickedTied = maxTied(pickedRows);
    teams[player] = {
      mostRight: maxTied(rankedTeams(right)),
      mostWrong: maxTied(rankedTeams(wrong)),
      mostPicked: pickedTied.length > 1 ? pickedTied : pickedRows.slice(0, 3),
      burnedBy: maxTied(rankedTeams(burned)),
      locks,
    };
  }

  const familyLocks = (teams[players[0]] ? teams[players[0]].locks : [])
    .map((lock) => lock.team)
    .filter((team) => players.every((p) => teams[p].locks.some((lock) => lock.team === team)));

  const maxDeficit = Object.fromEntries(players.map((p) => [p, { deficit: 0, week: null }]));
  const holeRun = Object.fromEntries(players.map((p) => [p, 0]));
  for (const game of decided) {
    for (const player of players) {
      if (game.picks && game.picks[player] === game.winner) holeRun[player] += 1;
    }
    const best = Math.max(...players.map((p) => holeRun[p]));
    for (const player of players) {
      const deficit = best - holeRun[player];
      if (deficit > maxDeficit[player].deficit) maxDeficit[player] = { deficit, week: game.week };
    }
  }

  let biggestGap = null;
  for (const row of weekly) {
    const values = players.map((p) => row.scores[p].correct);
    const spread = Math.max(...values) - Math.min(...values);
    if (!biggestGap || spread > biggestGap.spread) {
      biggestGap = { week: row.week, spread, scores: row.scores, winners: row.winners };
    }
  }

  const recapGames = decided.filter((g) => g.week === data.asOfWeek);
  const recapScores = Object.fromEntries(players.map((p) => [
    p,
    recapGames.filter((g) => g.picks && g.picks[p] === g.winner).length,
  ]));
  const recapBest = recapGames.length ? Math.max(...players.map((p) => recapScores[p])) : 0;
  const recapWinners = recapGames.length ? players.filter((p) => recapScores[p] === recapBest) : [];

  const upcoming = weeks
    .filter((week) => week > data.asOfWeek && games.some((g) => g.week === week))
    .map((week) => {
      const slate = games.filter((g) => g.week === week).map((game) => {
        const picks = Object.fromEntries(players.map((p) => [p, game.picks ? game.picks[p] : null]));
        const disagree = new Set(players.map((p) => picks[p])).size > 1;
        return {
          key: game.key,
          away: game.away,
          home: game.home,
          picks,
          disagree,
          winner: game.winner,
        };
      });
      return {
        week,
        date: weekDate(data, week),
        games: slate,
        splits: slate.filter((g) => g.disagree).length,
      };
    });

  const last = decided.length ? decided[decided.length - 1] : null;

  return {
    season: data.season,
    asOfWeek: data.asOfWeek,
    asOfNote: data.asOfNote || "",
    players,
    decidedCount: decided.length,
    upcomingCount: games.length - decided.length,
    gameCount: games.length,
    totals,
    ranking,
    leaderNames,
    margins,
    maxCorrect,
    weekly,
    cumulative,
    leadTimeline,
    h2h: {
      unanimous,
      split,
      allCorrect,
      allWrong,
      splitWins,
      soleCorrect,
      soleWrong,
      lonePicks,
      perfectWeeks,
      pairwise,
      lowerSideWins,
    },
    spoilers,
    allMiss,
    upsetCalls,
    homeWins,
    homeAway,
    conferences,
    streaks,
    weeksBestWorst: Object.fromEntries(players.map((p) => [p, bestWorst(p)])),
    teams,
    familyLocks,
    maxDeficit,
    biggestGap,
    lastDecided: last ? { week: last.week, away: last.away, home: last.home, winner: last.winner } : null,
    recap: {
      week: data.asOfWeek,
      date: weekDate(data, data.asOfWeek),
      games: recapGames.length,
      scores: recapScores,
      winners: recapWinners,
      misses: allMiss.filter((g) => g.week === data.asOfWeek),
      calls: upsetCalls.filter((g) => g.week === data.asOfWeek),
      splits: recapGames.filter((g) => new Set(players.map((p) => g.picks && g.picks[p])).size > 1).length,
    },
    upcoming,
  };
}

function compressLeads(timeline) {
  const runs = [];
  for (const row of timeline) {
    const key = row.leaders.join("\0");
    const last = runs[runs.length - 1];
    if (!last || last.key !== key) {
      runs.push({ key, leaders: row.leaders.slice(), from: row.week, to: row.week });
    } else last.to = row.week;
  }
  return runs;
}

function leadSentence(stats) {
  const runs = compressLeads(stats.leadTimeline);
  if (!runs.length) return "No decided weeks yet.";
  const last = runs[runs.length - 1];
  const who = listNamesHtml(last.leaders);
  if (last.leaders.length > 1) return `${who} are tied atop the board after Week ${last.to}.`;
  if (last.from === last.to) return `${who} has the lead after Week ${last.to}.`;
  return `${who} has held the lead since Week ${last.from}.`;
}

function holeSentence(player, stats) {
  const hole = stats.maxDeficit[player];
  const behindNow = stats.maxCorrect - stats.totals[player].correct;
  if (!hole.deficit) return `${esc(player)} has not fallen behind.`;
  let now = `is ${behindNow} back`;
  if (behindNow === 0 && stats.leaderNames.length === 1) now = "leads the board";
  else if (behindNow === 0) now = "is tied for the lead";
  return `${esc(player)} was ${hole.deficit} back during Week ${hole.week} and now ${now}.`;
}

function matchupHtml(game) {
  return `<b>${esc(game.away)}</b> <span class="at">@</span> <b>${esc(game.home)}</b>`;
}

function streakSpan(row) {
  if (!row) return "";
  return `Week ${row.week}, ${esc(row.away)} @ ${esc(row.home)}`;
}

function renderHero(stats) {
  const tied = stats.leaderNames.length > 1;
  const nameColor = stats.leaderNames.length === 1 ? colorFor(stats.leaderNames[0]) : "#f4f7f2";
  const marginItems = stats.players
    .filter((p) => !stats.leaderNames.includes(p))
    .map((p) => `<li><strong>${stats.margins[p]}</strong><span>ahead of ${playerSpan(p)}</span></li>`)
    .join("");
  const marginBlock = marginItems
    ? `<ul class="margin-list">${marginItems}</ul>`
    : `<p class="fine">Everyone is level. No one has a lead.</p>`;
  const rows = stats.ranking.map((row) => `
    <div class="st-row${row.behind === 0 ? " is-leader" : ""}">
      <div class="st-rank labeled" data-label="Rank">${row.rank === 1 ? "🏆 " : ""}${row.rank}</div>
      <div class="st-player">${playerSpan(row.player)}</div>
      <div class="st-num labeled" data-label="Correct">${row.correct}</div>
      <div class="st-num labeled" data-label="Games">${row.games}</div>
      <div class="st-num labeled" data-label="Win %">
        ${pctLabel(row.correct, row.games)}
        <span class="mini-track" style="--pc:${colorFor(row.player)}"><span style="--w:${widthOf(row.correct, row.games)};width:${widthOf(row.correct, row.games)}"></span></span>
      </div>
      <div class="st-num labeled" data-label="Behind">${row.behind === 0 ? "—" : row.behind}</div>
    </div>`).join("");

  return `
    <section class="hero" id="hero" aria-labelledby="leader-name">
      <div class="card hero-card">
        <p class="kicker">${tied ? "🏆 Tied at the top" : "🏆 Season leader"} · ${esc(stats.season)}</p>
        ${tied ? `<p class="tie-flag">Shared lead</p>` : ""}
        <h1 class="leader-name" id="leader-name" style="color:${nameColor}">${listNamesHtml(stats.leaderNames)}</h1>
        <p class="hero-record"><span class="led">${stats.maxCorrect}</span><span>correct</span></p>
        <p class="hero-pct"><strong>${pctLabel(stats.maxCorrect, stats.decidedCount)}</strong> win rate · ${stats.decidedCount} decided games</p>
        ${marginBlock}
        <p class="fine">A pick is correct when it matches the winner. ${stats.upcomingCount} games are still upcoming and stay off this table. ${esc(stats.asOfNote)}</p>
      </div>
      <div class="card board-card">
        <p class="kicker">Standings</p>
        <h2 class="sr-only">Season standings</h2>
        <div class="standings" style="margin-top:10px">
          <div class="st-row st-head">
            <div>#</div><div>Player</div><div class="st-num">Correct</div><div class="st-num">Games</div><div class="st-num">Win %</div><div class="st-num">Behind</div>
          </div>
          ${rows}
        </div>
        <p class="board-note">Rank uses correct picks. A tie shares the rank. Behind is games back of the lead.</p>
      </div>
    </section>`;
}

function renderRace(stats) {
  const bits = stats.players.map((p) => `${esc(p)} ${stats.totals[p].correct}`);
  const runs = compressLeads(stats.leadTimeline);
  const strip = runs.map((run, index) => `
    <li class="${index === runs.length - 1 ? "is-now" : ""}">
      <span class="wk">${weekRangeShort(run.from, run.to)}</span>
      <span class="names">${run.leaders.map((p) => playerSpan(p)).join('<span class="amp">&amp;</span>')}</span>
    </li>`).join("");
  return `
    <section id="race">
      <div class="section-head">
        <p class="kicker">Cumulative</p>
        <h2>The race</h2>
        <p class="lede">${leadSentence(stats)} The line is correct picks after each week that already has a result, starting at Week ${stats.weekly[0] ? stats.weekly[0].week : 0}.</p>
      </div>
      <div class="card">
        <div class="chart-box">
          <canvas id="raceChart" aria-describedby="race-desc"></canvas>
          <p class="chart-fallback" hidden>The line chart needs Chart.js. The totals below and the week-by-week table are the same numbers.</p>
        </div>
        <p class="sr-only" id="race-desc">Cumulative correct picks by week. Latest totals: ${bits.join(", ")}.</p>
        <p class="summary-line">After Week ${esc(stats.asOfWeek)} — ${bits.join(", ")}.</p>
        <ol class="lead-strip" aria-label="Who led after each week">${strip}</ol>
      </div>
    </section>`;
}

function renderWeeks(stats) {
  const head = stats.players.map((p) => `<th class="num" style="color:${colorFor(p)}">${esc(p)}</th>`).join("");
  const body = stats.weekly.map((row) => {
    const cells = stats.players.map((p) => {
      const score = row.scores[p];
      const cum = stats.cumulative.find((c) => c.week === row.week).totals[p];
      const win = row.winners.includes(p);
      return `<td class="num${win ? " is-win" : ""}" style="--pc:${colorFor(p)}"><span class="wk-score">${score.correct}${row.perfect.includes(p) ? '<span class="sweep">sweep</span>' : ""}</span><span class="wk-cum">${cum} total</span></td>`;
    }).join("");
    const date = row.date ? formatDate(row.date) : "";
    return `<tr><th scope="row">Week ${row.week}${date ? `<div class="wk-cum">${esc(date)}</div>` : ""}</th><td class="num">${row.games}</td>${cells}<td>${row.winners.map((p) => playerSpan(p)).join(" ")}</td></tr>`;
  }).join("");
  return `
    <section id="weeks">
      <div class="section-head">
        <p class="kicker">Each Saturday</p>
        <h2>Week by week</h2>
        <p class="lede">Highlighted scores won that week. A shared high score shares the week. The small number under each score is the running total.</p>
      </div>
      <div class="card">
        <h3>Weekly scores</h3>
        <div class="chart-box">
          <canvas id="weekChart" aria-describedby="week-desc"></canvas>
          <p class="chart-fallback" hidden>The bar chart needs Chart.js. Every weekly score is in the table.</p>
        </div>
        <p class="sr-only" id="week-desc">Bar chart of correct picks per player each week.</p>
        <div class="table-wrap">
          <table class="weeks sticky-col">
            <thead><tr><th>Week</th><th class="num">Games</th>${head}<th>Week winner</th></tr></thead>
            <tbody>${body}</tbody>
            <caption>Correct picks each week. Highlighted cells won the week. A sweep tag marks a perfect card.</caption>
          </table>
        </div>
      </div>
    </section>`;
}

function renderH2H(stats) {
  const { h2h, players } = stats;
  const chalk = pctLabel(h2h.allCorrect, h2h.unanimous);
  const splitLead = leadersOf(h2h.splitWins, players);
  const soleLead = leadersOf(h2h.soleCorrect, players);
  const perfectCounts = Object.fromEntries(players.map((p) => [p, h2h.perfectWeeks[p].length]));
  const perfectLead = leadersOf(perfectCounts, players);
  const splitSentence = h2h.split
    ? `${listNamesHtml(splitLead.names)} won the most split games${splitLead.names.length === 1 ? `, going ${h2h.splitWins[splitLead.names[0]]} for ${h2h.split} (${pctLabel(h2h.splitWins[splitLead.names[0]], h2h.split)})` : `, tied at ${splitLead.max}`}.`
    : "There are no split games yet.";
  const soleSentence = `${listNamesHtml(soleLead.names)} ${soleLead.names.length === 1 ? "was" : "were"} the only correct caller most often, ${soleLead.names.length === 1 ? `${soleLead.max} times` : `tied at ${soleLead.max}`}.`;
  let perfectCopy;
  if (perfectLead.max === 0) {
    perfectCopy = `Nobody has a perfect week yet. ${listNamesHtml(players)} are tied at zero.`;
  } else {
    const detail = perfectLead.names.map((p) => `${esc(p)} (${h2h.perfectWeeks[p].map((w) => `Week ${w}`).join(", ")})`).join("; ");
    perfectCopy = `${listNamesHtml(perfectLead.names)} ${perfectLead.names.length === 1 ? "has" : "have"} the most perfect weeks: ${detail}.`;
  }

  const splitBars = players.map((p) => `
    <div class="bar-row">
      <span>${playerSpan(p)}</span>
      <span class="track" style="--pc:${colorFor(p)}"><span style="--w:${widthOf(h2h.splitWins[p], h2h.split)};width:${widthOf(h2h.splitWins[p], h2h.split)}"></span></span>
      <span class="bar-val">${h2h.splitWins[p]}/${h2h.split}</span>
    </div>`).join("");

  const soleCards = players.map((p) => `
    <article class="card stat-card">
      <p class="kicker">Only one right</p>
      <p>${playerSpan(p)}</p>
      <p class="big" style="color:${colorFor(p)}">${h2h.soleCorrect[p]}</p>
      <p>Lone stands: ${h2h.lonePicks[p]} · hit rate ${pctLabel(h2h.soleCorrect[p], h2h.lonePicks[p])}. Only miss: ${h2h.soleWrong[p]}.</p>
    </article>`).join("");

  const pairs = h2h.pairwise.map((row) => {
    const splits = row.aOnly + row.bOnly;
    return `
      <article class="card pair-card">
        <h3>${esc(row.a)} vs ${esc(row.b)}</h3>
        <p class="muted">Agreed on ${row.agree} of ${stats.decidedCount} (${pctLabel(row.agree, stats.decidedCount)}). Those shared tickets were right ${row.bothRight} times (${pctLabel(row.bothRight, row.agree)}).</p>
        ${splits ? `<div class="vs-bar" aria-hidden="true"><span style="--w:${widthOf(row.aOnly, splits)};width:${widthOf(row.aOnly, splits)};background:${colorFor(row.a)}"></span><span style="--w:${widthOf(row.bOnly, splits)};width:${widthOf(row.bOnly, splits)};background:${colorFor(row.b)}"></span></div>
        <p class="vs-line"><span style="color:${colorFor(row.a)}">${esc(row.a)} ${row.aOnly}</span><span class="muted">when they split</span><span style="color:${colorFor(row.b)}">${row.bOnly} ${esc(row.b)}</span></p>` : `<p class="muted">They have not split a decided game.</p>`}
      </article>`;
  }).join("");

  return `
    <section id="h2h">
      <div class="section-head">
        <p class="kicker">Same ticket or not</p>
        <h2>Head to head</h2>
        <p class="lede">${splitSentence} ${soleSentence}</p>
      </div>
      <div class="stat-grid cols-4">
        <article class="card stat-card"><p class="kicker">All three agreed</p><p class="big">${h2h.unanimous}</p><p>of ${stats.decidedCount} decided games</p></article>
        <article class="card stat-card"><p class="kicker">Split games</p><p class="big">${h2h.split}</p><p>at least one different pick</p></article>
        <article class="card stat-card"><p class="kicker">Chalk when united</p><p class="big">${chalk}</p><p>${h2h.allCorrect} right · ${h2h.allWrong} all wrong</p></article>
        <article class="card stat-card"><p class="kicker">Perfect weeks</p><p class="big">${perfectLead.max}</p><p>${perfectCopy}</p></article>
      </div>
      <div class="card" style="margin-top:12px">
        <h3>Split-game record</h3>
        <p class="muted">Correct picks inside the ${h2h.split} games where the family did not all match.</p>
        <div class="bar-list">${splitBars}</div>
      </div>
      <div class="stat-grid cols-3" style="margin-top:12px">${soleCards}</div>
      <div class="card-grid" style="margin-top:12px">${pairs}</div>
    </section>`;
}

function renderUpsets(stats) {
  const { h2h, players } = stats;
  const soleTotal = players.reduce((sum, p) => sum + h2h.soleCorrect[p], 0);
  const partitioned = h2h.lowerSideWins === h2h.allWrong + soleTotal;
  const intro = partitioned
    ? `The winner was the lower side of the ticket — the team fewer people picked — ${h2h.lowerSideWins} times. ${h2h.allWrong} of those were games everyone missed, and ${soleTotal} were called by exactly one person.`
    : `The winner was the side fewer people picked in ${h2h.lowerSideWins} decided games. Everyone missed ${h2h.allWrong} games. A lone correct pick happened ${soleTotal} times.`;
  const top = stats.spoilers[0];
  const callout = top
    ? `<div class="callout"><p class="kicker">Beat the family most often</p><h3>${esc(top.team)}</h3><p class="led">${top.picks}</p><p>wrong family picks across ${top.games} ${top.games === 1 ? "win" : "wins"}. Each miss is one person on the other side of a ${esc(top.team)} win.</p></div>`
    : "";
  const preview = 12;
  const rows = stats.spoilers.map((row, index) => `
    <tr class="${index >= preview ? "extra-spoiler" : ""}">
      <th scope="row">${esc(row.team)}</th>
      <td class="num">${row.picks}</td>
      <td class="num">${row.games}</td>
    </tr>`).join("");
  const more = stats.spoilers.length > preview
    ? `<button type="button" class="ghost-btn" data-action="spoilers" aria-expanded="false" style="margin-top:10px">Show all ${stats.spoilers.length} spoilers</button>`
    : "";
  const misses = stats.allMiss.slice().sort((a, b) => b.week - a.week || a.away.localeCompare(b.away));
  const missItems = misses.map((game) => `
    <li>
      <span class="game-week">Week ${game.week}</span>
      <span class="match">${matchupHtml(game)}</span>
      <span>All picked ${esc(game.picked)}. <b>${esc(game.winner)}</b> won.</span>
    </li>`).join("");
  const calls = stats.upsetCalls.slice().sort((a, b) => b.week - a.week || a.caller.localeCompare(b.caller));
  const callItems = calls.map((game) => `
    <li>
      <span class="game-week">Week ${game.week}</span>
      <span class="match">${matchupHtml(game)}</span>
      <span>${playerSpan(game.caller)} picked ${esc(game.winner)}. ${game.against ? `The other pick was ${esc(game.against)}.` : ""}</span>
    </li>`).join("");
  const callerLine = players.map((p) => `${esc(p)} ${h2h.soleCorrect[p]}`).join(" · ");

  return `
    <section id="upsets">
      <div class="section-head">
        <p class="kicker">Lower side of the ticket</p>
        <h2>Upset wire</h2>
        <p class="lede">${intro}</p>
      </div>
      ${callout}
      <div class="card">
        <h3>Who beat the picks</h3>
        <p class="muted">Missed picks count every person who chose the other team. Games are wins where at least one pick was wrong.</p>
        <div class="table-wrap">
          <table class="spoilers" id="spoiler-table">
            <thead><tr><th>Winner</th><th class="num">Missed picks</th><th class="num">Games</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${more}
      </div>
      <div class="card" style="margin-top:12px">
        <h3>Everyone missed · ${stats.allMiss.length}</h3>
        <p class="muted">All three picked the same team, and that team lost.</p>
        <div class="scroll-list"><ul class="miss-list">${missItems}</ul></div>
      </div>
      <div class="card" style="margin-top:12px">
        <h3>Who picked the upset · ${callerLine}</h3>
        <p class="muted">Games with exactly one correct pick. With two teams on the ticket, that person was alone on the winner.</p>
        <div class="scroll-list"><ul class="call-list">${callItems}</ul></div>
      </div>
    </section>`;
}

function renderHome(stats) {
  const cards = stats.players.map((p) => {
    const row = stats.homeAway[p];
    const decided = row.homePicks + row.awayPicks;
    return `
      <article class="card">
        <h3>${playerSpan(p)}</h3>
        <div class="bar-list">
          <div class="bar-row">
            <span>Home</span>
            <span class="track" style="--pc:${colorFor(p)}"><span style="width:${widthOf(row.homeCorrect, row.homePicks)}"></span></span>
            <span class="bar-val">${pctLabel(row.homeCorrect, row.homePicks)}</span>
          </div>
          <div class="bar-row">
            <span>Away</span>
            <span class="track" style="--pc:${colorFor(p)}"><span style="width:${widthOf(row.awayCorrect, row.awayPicks)}"></span></span>
            <span class="bar-val">${pctLabel(row.awayCorrect, row.awayPicks)}</span>
          </div>
        </div>
        <p class="footnote">Decided: home ${row.homePicks}/${decided} (${pctLabel(row.homePicks, decided)}), ${row.homeCorrect} right. Away ${row.awayPicks}/${decided}, ${row.awayCorrect} right.</p>
        <p class="footnote">Full ticket, including upcoming: ${row.seasonHome} home · ${row.seasonAway} away.</p>
      </article>`;
  }).join("");
  const homeRate = pctLabel(stats.homeWins, stats.decidedCount);
  return `
    <section id="home">
      <div class="section-head">
        <p class="kicker">Sideline</p>
        <h2>Home vs away</h2>
        <p class="lede">How often each player takes the home team, and how often that side is right. Accuracy uses decided games only.</p>
      </div>
      <div class="card home-hero">
        <p class="mega">${homeRate}</p>
        <p>Home teams won <strong>${stats.homeWins}</strong> of <strong>${stats.decidedCount}</strong> decided games. Away teams won the other ${stats.decidedCount - stats.homeWins}.</p>
      </div>
      <div class="card-grid">${cards}</div>
    </section>`;
}

function renderConferences(stats) {
  const head = stats.players.map((p) => `<th class="num" style="color:${colorFor(p)}">${esc(p)}</th>`).join("");
  const body = stats.conferences.map((conf) => {
    const best = Math.max(...stats.players.map((p) => conf.byPlayer[p].pct));
    const cells = stats.players.map((p) => {
      const row = conf.byPlayer[p];
      const isBest = row.made > 0 && row.pct === best;
      return `<td class="num${isBest ? " is-best" : ""}" style="--pc:${colorFor(p)}"><span class="cell-pct">${pctLabel(row.correct, row.made)}</span><span class="cell-rec">${row.correct}/${row.made} picks</span><span class="mini-track" style="--pc:${colorFor(p)}"><span style="width:${widthOf(row.correct, row.made)}"></span></span></td>`;
    }).join("");
    return `<tr><th scope="row">${esc(conf.name)}</th><td class="num">${conf.games}</td>${cells}</tr>`;
  }).join("");
  const lists = stats.conferences.map((conf) => `
    <details>
      <summary>${esc(conf.name)} · ${conf.teams.length} ${conf.teams.length === 1 ? "team" : "teams"}</summary>
      <p>${conf.teams.map(esc).join(", ")}</p>
    </details>`).join("");
  return `
    <section id="conferences">
      <div class="section-head">
        <p class="kicker">By league</p>
        <h2>Conference stats</h2>
        <p class="lede">A game counts when either team is in the group, so a cross-conference game sits in both rows. Picks are one per player per counted game. Gold percent is the best accuracy in that row.</p>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="conf sticky-col">
            <thead><tr><th>Conference</th><th class="num">Games</th>${head}</tr></thead>
            <tbody>${body}</tbody>
            <caption>Accuracy is correct picks divided by picks made in games involving that group.</caption>
          </table>
        </div>
        <div class="conf-list">${lists}</div>
      </div>
    </section>`;
}

function pillList(entries) {
  if (!entries || !entries.length) return `<span class="muted">—</span>`;
  return entries.map((row) => `<span class="team-pill">${esc(row.team)} <b>${row.count}</b></span>`).join("");
}

function renderFun(stats) {
  const streakCards = stats.players.map((p) => {
    const row = stats.streaks[p];
    const current = row.current
      ? `${row.current} and counting, ${streakSpan(row.currentStart)} through ${streakSpan(row.currentEnd)}.`
      : `Cold right now. Last decided game was a miss${stats.lastDecided ? `: ${esc(stats.lastDecided.away)} @ ${esc(stats.lastDecided.home)} in Week ${stats.lastDecided.week}` : ""}.`;
    const best = row.best
      ? `${row.best} straight, ${streakSpan(row.bestStart)} through ${streakSpan(row.bestEnd)}.`
      : "No correct pick yet.";
    const cold = row.longestMiss
      ? `${row.longestMiss} misses in a row, ${streakSpan(row.missStart)} through ${streakSpan(row.missEnd)}.`
      : "No misses yet.";
    return `
      <article class="card">
        <h3>${playerSpan(p)}</h3>
        <p class="big" style="color:${colorFor(p)};font-family:Oswald,Impact,sans-serif;font-size:2.6rem;line-height:1;margin:8px 0">${row.best}</p>
        <p><span class="muted">Longest correct streak.</span> ${best}</p>
        <p class="footnote"><span class="muted">Current streak.</span> ${current}</p>
        <p class="footnote"><span class="muted">Longest miss streak.</span> ${cold}</p>
      </article>`;
  }).join("");

  const weekCards = stats.players.map((p) => {
    const row = stats.weeksBestWorst[p];
    const line = (label, rec) => rec
      ? `<p><span class="muted">${label}</span> Week ${rec.week}${rec.date ? ` (${esc(formatDate(rec.date))})` : ""} · ${rec.correct}/${rec.games} (${pctLabel(rec.correct, rec.games)})${label === "Cleanest card" ? ` · ${rec.misses} ${rec.misses === 1 ? "miss" : "misses"}` : ""}</p>`
      : "";
    return `
      <article class="card">
        <h3>${playerSpan(p)}</h3>
        ${line("Best week", row.best)}
        ${line("Coldest week", row.worst)}
        ${line("Cleanest card", row.cleanest)}
        <p class="footnote">${holeSentence(p, stats)}</p>
      </article>`;
  }).join("");

  const teamCards = stats.players.map((p) => {
    const info = stats.teams[p];
    const locks = info.locks.map((row) => `<span class="team-pill">${esc(row.team)} <b>${row.count}</b></span>`).join("");
    const tie = (rows) => (rows.length > 1 ? " · tied" : "");
    return `
      <article class="card">
        <h3>${playerSpan(p)}</h3>
        <p class="footnote muted">Right about${tie(info.mostRight)}</p>
        <div class="team-pills">${pillList(info.mostRight)}</div>
        <p class="footnote muted">Wrong about${tie(info.mostWrong)} · picked them, they lost</p>
        <div class="team-pills">${pillList(info.mostWrong)}</div>
        <p class="footnote muted">Burned by${tie(info.burnedBy)} · they won, this pick was the other side</p>
        <div class="team-pills">${pillList(info.burnedBy)}</div>
        <p class="footnote muted">Most picked${tie(info.mostPicked)}</p>
        <div class="team-pills">${pillList(info.mostPicked)}</div>
        <p class="footnote muted">Locks · 4 or more correct, never wrong</p>
        <div class="team-pills">${locks || "<span class='muted'>None yet</span>"}</div>
      </article>`;
  }).join("");

  const locks = stats.familyLocks.length
    ? `<p class="lock-line"><span class="kicker">Family locks</span><br />${stats.familyLocks.slice().sort((a, b) => a.localeCompare(b)).map(esc).join(", ")}. Everyone is undefeated when they pick them, at least four times each.</p>`
    : `<p class="lock-line">No team is a perfect lock for the whole family yet.</p>`;

  let gap = "";
  if (stats.biggestGap) {
    const order = stats.players.slice().sort((a, b) => stats.biggestGap.scores[b].correct - stats.biggestGap.scores[a].correct);
    const bits = order.map((p) => `${esc(p)} ${stats.biggestGap.scores[p].correct}`).join(", ");
    gap = `Biggest weekly gap was Week ${stats.biggestGap.week} (${stats.biggestGap.spread} picks): ${bits}.`;
  }

  return `
    <section id="fun">
      <div class="section-head">
        <p class="kicker">Streaks and habits</p>
        <h2>Fun stats</h2>
        <p class="lede">Streaks walk decided games in the order they appear in the file. “Right about” and “wrong about” are teams that player picked. “Burned by” is the winner when their pick lost. ${gap}</p>
      </div>
      <div class="card" style="margin-bottom:12px">${locks}</div>
      <div class="card-grid">${streakCards}</div>
      <div class="card-grid" style="margin-top:12px">${weekCards}</div>
      <div class="card-grid" style="margin-top:12px">${teamCards}</div>
    </section>`;
}

function renderRecap(stats) {
  const recap = stats.recap;
  const date = recap.date ? formatDate(recap.date) : "";
  const scores = stats.players.map((p) => {
    const win = recap.winners.includes(p);
    return `
      <article class="recap-score${win ? " is-winner" : ""}" style="--pc:${colorFor(p)}">
        <p>${playerSpan(p)}${win ? " 🏆" : ""}</p>
        <p class="led">${recap.scores[p] || 0}</p>
        <p class="muted">of ${recap.games}</p>
      </article>`;
  }).join("");
  let headline = "No decided games in this week yet.";
  if (recap.games) {
    if (recap.winners.length === 1) {
      const winner = recap.winners[0];
      const margins = stats.players
        .filter((p) => p !== winner)
        .map((p) => `${recap.scores[winner] - recap.scores[p]} over ${esc(p)}`);
      headline = `${esc(winner)} took Week ${recap.week}${margins.length ? `, by ${margins.join(" and by ")}` : ""}.`;
    } else {
      headline = `${listNamesHtml(recap.winners)} tied for Week ${recap.week} at ${recap.scores[recap.winners[0]]}.`;
    }
  }
  const calls = recap.calls.map((game) => `<li><span class="match">${matchupHtml(game)}</span><span>${playerSpan(game.caller)} alone on ${esc(game.winner)}${game.against ? ` (others picked ${esc(game.against)})` : ""}.</span></li>`).join("");
  const misses = recap.misses.map((game) => `<li><span class="match">${matchupHtml(game)}</span><span>All picked ${esc(game.picked)}. ${esc(game.winner)} won.</span></li>`).join("");
  return `
    <section id="recap">
      <div class="section-head">
        <p class="kicker">Latest card</p>
        <h2>Week ${esc(recap.week)} recap${date ? ` · ${esc(date)}` : ""}</h2>
        <p class="lede">${headline} ${recap.games ? `${recap.splits} of ${recap.games} games were splits.` : ""}</p>
      </div>
      <div class="card">
        <div class="recap-scores">${scores}</div>
        <div class="subhead"><h3>Lone correct calls · ${recap.calls.length}</h3></div>
        ${calls ? `<ul class="call-list">${calls}</ul>` : `<p class="empty">Nobody was alone on a winner this week.</p>`}
        <div class="subhead"><h3>Everyone missed · ${recap.misses.length}</h3></div>
        ${misses ? `<ul class="miss-list">${misses}</ul>` : `<p class="empty">No game fooled the whole family.</p>`}
      </div>
    </section>`;
}

function loneNames(picks, players) {
  const counts = {};
  for (const player of players) counts[picks[player]] = (counts[picks[player]] || 0) + 1;
  return new Set(players.filter((p) => counts[picks[p]] === 1));
}

function gameCard(game, players) {
  const lones = loneNames(game.picks, players);
  const picks = players.map((p) => `
    <div class="pick${lones.has(p) ? " lone" : ""}" style="--pc:${colorFor(p)}">
      <span class="pname">${esc(p)}</span>
      <span class="pteam">${esc(game.picks[p])}</span>
    </div>`).join("");
  return `
    <article class="game${game.disagree ? " split" : ""}">
      <header>
        <span class="match">${matchupHtml(game)}</span>
        <span class="tag${game.disagree ? "" : " same"}">${game.disagree ? "Split" : "Same"}</span>
      </header>
      <div class="picks">${picks}</div>
    </article>`;
}

function renderUpcomingPanel(stats) {
  const week = stats.upcoming.find((row) => row.week === ui.week) || stats.upcoming[0];
  if (!week) return `<p class="empty">No weeks left after Week ${esc(stats.asOfWeek)}.</p>`;
  const splits = week.games.filter((g) => g.disagree);
  const hidden = week.games.length - splits.length;
  const visible = ui.splitsOnly ? splits : week.games;
  const filter = week.splits
    ? `<button type="button" class="ghost-btn" data-action="splits-filter" aria-pressed="${ui.splitsOnly ? "true" : "false"}">${ui.splitsOnly ? "Show every game" : `Splits only (${week.splits})`}</button>`
    : "";
  const date = week.date ? formatDate(week.date) : "";
  const status = ui.splitsOnly
    ? `showing ${splits.length} split ${splits.length === 1 ? "game" : "games"}${hidden ? ` · ${hidden} agreed ${hidden === 1 ? "game" : "games"} hidden` : ""}`
    : `${week.games.length} games · ${week.splits} splits`;
  const cards = visible.length
    ? visible.map((g) => gameCard(g, stats.players)).join("")
    : `<p class="empty">No disagreements this week. Everyone is on the same side of every ticket.</p>`;
  return `
    <div class="panel-tools">
      <p id="upcoming-status"><strong>Week ${week.week}</strong>${date ? ` · ${esc(date)}` : ""} · ${status}</p>
      ${filter}
    </div>
    <p class="footnote">Games stay in slate order. A gold edge means the three picks do not match. These games are not in the standings.</p>
    ${cards}`;
}

function renderUpcoming(stats) {
  if (!stats.upcoming.length) {
    return `
      <section id="upcoming">
        <div class="section-head"><p class="kicker">Still to play</p><h2>Upcoming weeks</h2></div>
        <div class="card"><p class="empty">No weeks left after Week ${esc(stats.asOfWeek)}.</p></div>
      </section>`;
  }
  const tabs = stats.upcoming.map((row) => {
    const selected = row.week === ui.week;
    const date = row.date ? formatDate(row.date) : "";
    return `<button type="button" class="tab" id="tab-week-${row.week}" role="tab" data-week-tab="${row.week}" aria-selected="${selected ? "true" : "false"}" tabindex="${selected ? "0" : "-1"}" aria-controls="upcoming-panel">Week ${row.week}${date ? `<small>${esc(date)}</small>` : ""}</button>`;
  }).join("");
  return `
    <section id="upcoming">
      <div class="section-head">
        <p class="kicker">Still to play</p>
        <h2>Upcoming weeks</h2>
        <p class="lede">Every week after Week ${esc(stats.asOfWeek)}. The interesting tickets are the ones where Tyler, Tatum, and Abigail do not all match.</p>
      </div>
      <div class="card">
        <div class="tabs" role="tablist" aria-label="Upcoming weeks">${tabs}</div>
        <div id="upcoming-panel" role="tabpanel">${renderUpcomingPanel(stats)}</div>
      </div>
    </section>`;
}

function renderFooter(stats) {
  return `
    <footer class="site-footer wrap">
      <p>${esc(stats.asOfNote)}</p>
      <p>View-only family site</p>
    </footer>`;
}

function renderPage(stats) {
  const jumps = [
    ["hero", "Leader"],
    ["race", "Race"],
    ["weeks", "Weeks"],
    ["h2h", "Head-to-head"],
    ["upsets", "Upsets"],
    ["home", "Home"],
    ["conferences", "Conferences"],
    ["fun", "Streaks"],
    ["recap", `Week ${stats.asOfWeek}`],
    ["upcoming", "Upcoming"],
  ];
  return `
    <header class="topbar wrap">
      <p class="wordmark"><span class="ball" aria-hidden="true">🏈</span> Family CFB Pick'em</p>
      <p class="season-pill">${esc(stats.season)} · Week ${esc(stats.asOfWeek)}</p>
    </header>
    <div class="jump-bar">
      <nav class="wrap jump" aria-label="Sections">
        ${jumps.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join("")}
      </nav>
    </div>
    <main class="wrap">
      ${renderHero(stats)}
      ${renderRace(stats)}
      ${renderWeeks(stats)}
      ${renderH2H(stats)}
      ${renderUpsets(stats)}
      ${renderHome(stats)}
      ${renderConferences(stats)}
      ${renderFun(stats)}
      ${renderRecap(stats)}
      ${renderUpcoming(stats)}
    </main>
    ${renderFooter(stats)}`;
}

function chartColors() {
  return {
    text: "#d7e7dc",
    muted: "#b7cfc2",
    grid: "rgba(255,255,255,0.08)",
  };
}

function showChartFallback() {
  document.querySelectorAll(".chart-box").forEach((box) => {
    const note = box.querySelector(".chart-fallback");
    const canvas = box.querySelector("canvas");
    if (note) note.hidden = false;
    if (canvas) canvas.hidden = true;
  });
}

function drawCharts(stats) {
  if (typeof Chart === "undefined" || !stats.weekly.length) {
    showChartFallback();
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const colors = chartColors();
  Chart.defaults.color = colors.text;
  Chart.defaults.borderColor = colors.grid;
  Chart.defaults.font.family = 'Outfit, "Segoe UI", sans-serif';
  const labels = stats.weekly.map((row) => `W${row.week}`);
  const commonScales = {
    x: { ticks: { color: colors.muted }, grid: { color: colors.grid } },
    y: { beginAtZero: true, ticks: { color: colors.muted, precision: 0 }, grid: { color: colors.grid } },
  };
  try {
    const race = document.getElementById("raceChart");
    const weeks = document.getElementById("weekChart");
    if (!race || !weeks) return;
    const existing = window.__pickemCharts || [];
    existing.forEach((chart) => chart.destroy());
    window.__pickemCharts = [
      new Chart(race, {
        type: "line",
        data: {
          labels,
          datasets: stats.players.map((player) => ({
            label: player,
            data: stats.cumulative.map((row) => row.totals[player]),
            borderColor: colorFor(player),
            backgroundColor: colorFor(player),
            tension: 0.25,
            borderWidth: 2.5,
            pointRadius: stats.cumulative.map((_, index) => (index === stats.cumulative.length - 1 ? 5 : 3)),
            pointHoverRadius: 6,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: reduce ? false : undefined,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { labels: { usePointStyle: true, boxWidth: 8 } },
            tooltip: {
              callbacks: {
                title(items) {
                  const row = stats.weekly[items[0].dataIndex];
                  const date = row.date ? formatDate(row.date) : "";
                  return date ? `Week ${row.week} · ${date}` : `Week ${row.week}`;
                },
                label(ctx) {
                  const row = stats.weekly[ctx.dataIndex];
                  const score = row.scores[ctx.dataset.label];
                  return `${ctx.dataset.label}: ${ctx.parsed.y} total · ${score.correct} this week`;
                },
              },
            },
          },
          scales: commonScales,
        },
      }),
      new Chart(weeks, {
        type: "bar",
        data: {
          labels,
          datasets: stats.players.map((player) => ({
            label: player,
            data: stats.weekly.map((row) => row.scores[player].correct),
            backgroundColor: colorFor(player),
            borderRadius: 4,
            maxBarThickness: 18,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: reduce ? false : undefined,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { labels: { usePointStyle: true, boxWidth: 8 } },
            tooltip: {
              callbacks: {
                title(items) {
                  const row = stats.weekly[items[0].dataIndex];
                  return `Week ${row.week}`;
                },
                label(ctx) {
                  const row = stats.weekly[ctx.dataIndex];
                  const score = row.scores[ctx.dataset.label];
                  return `${ctx.dataset.label}: ${score.correct}/${score.games} (${pctLabel(score.correct, score.games)})`;
                },
              },
            },
          },
          scales: commonScales,
        },
      }),
    ];
  } catch (error) {
    console.error(error);
    showChartFallback();
  }
}

function selectWeek(stats, week) {
  ui.week = Number(week);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-week-tab]").forEach((button) => {
    const on = Number(button.dataset.weekTab) === ui.week;
    button.setAttribute("aria-selected", on ? "true" : "false");
    button.tabIndex = on ? 0 : -1;
    if (on && button.parentElement) {
      const scroller = button.parentElement;
      const left = button.offsetLeft - scroller.clientWidth / 2 + button.offsetWidth / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
    }
  });
  const panel = document.getElementById("upcoming-panel");
  if (panel) {
    panel.innerHTML = renderUpcomingPanel(stats);
    panel.setAttribute("aria-labelledby", `tab-week-${ui.week}`);
  }
}

function bind(stats) {
  const root = document.getElementById("app");
  root.addEventListener("click", (event) => {
    const spoilerBtn = event.target.closest("[data-action='spoilers']");
    if (spoilerBtn) {
      ui.spoilersOpen = !ui.spoilersOpen;
      const table = document.getElementById("spoiler-table");
      if (table) table.classList.toggle("show-all-spoilers", ui.spoilersOpen);
      spoilerBtn.setAttribute("aria-expanded", ui.spoilersOpen ? "true" : "false");
      spoilerBtn.textContent = ui.spoilersOpen ? "Show the top of the list" : `Show all ${stats.spoilers.length} spoilers`;
    }
    const tab = event.target.closest("[data-week-tab]");
    if (tab) selectWeek(stats, tab.dataset.weekTab);
    const filter = event.target.closest("[data-action='splits-filter']");
    if (filter) {
      ui.splitsOnly = !ui.splitsOnly;
      const panel = document.getElementById("upcoming-panel");
      if (panel) panel.innerHTML = renderUpcomingPanel(stats);
    }
  });
  root.addEventListener("keydown", (event) => {
    const tab = event.target.closest("[data-week-tab]");
    if (!tab) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const tabs = [...root.querySelectorAll("[data-week-tab]")];
    const index = tabs.indexOf(tab);
    const next = event.key === "ArrowRight" ? tabs[index + 1] : tabs[index - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
    selectWeek(stats, next.dataset.weekTab);
  });

  const links = [...document.querySelectorAll(".jump a")];
  const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  if (sections.length && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      for (const link of links) {
        link.classList.toggle("is-current", link.getAttribute("href") === `#${visible.target.id}`);
      }
    }, { rootMargin: "-30% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] });
    sections.forEach((section) => observer.observe(section));
  }
}

function renderFatal(message) {
  return `
    <main class="wrap">
      <section class="card error-card" style="margin-top:32px">
        <h1>The board didn't load</h1>
        <p>${esc(message)}</p>
        <p class="footnote">Serve the repo root so <code>data.json</code> can load next to this page, then refresh.</p>
      </section>
    </main>`;
}

async function boot() {
  const app = document.getElementById("app");
  try {
    const response = await fetch(`data.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`data.json returned ${response.status}`);
    const data = await response.json();
    if (!data || !Array.isArray(data.players) || !Array.isArray(data.games)) {
      throw new Error("data.json is missing players or games");
    }
    const stats = computeStats(data);
    if (stats.upcoming.length) ui.week = stats.upcoming[0].week;
    document.title = `${data.season} Family CFB Pick'em`;
    app.innerHTML = renderPage(stats);
    app.dataset.ready = "1";
    app.dataset.decided = String(stats.decidedCount);
    app.dataset.abigail = String(stats.totals.Abigail ? stats.totals.Abigail.correct : "");
    app.dataset.tyler = String(stats.totals.Tyler ? stats.totals.Tyler.correct : "");
    app.dataset.tatum = String(stats.totals.Tatum ? stats.totals.Tatum.correct : "");
    app.dataset.unanimous = String(stats.h2h.unanimous);
    app.dataset.split = String(stats.h2h.split);
    bind(stats);
    drawCharts(stats);
  } catch (error) {
    console.error(error);
    app.innerHTML = renderFatal(error.message || "Could not read data.json");
  }
}

if (typeof document !== "undefined") boot();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeStats, formatDate, pctLabel, renderPage };
}
