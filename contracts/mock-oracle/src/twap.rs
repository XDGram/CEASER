//! Pure TWAP math shared by `MockOracle` (and, by design, `RefTwapOracle`).
//!
//! Semantics (INTERFACE.md section 2):
//!
//! - Observations are `(block_timestamp_ms, price)`, oldest first, newest 64 only.
//! - The price is piecewise constant: each observation holds until the next one.
//! - `twap` integrates over `[max(now - window, first_observation_ts), now]`
//!   and returns `floor(integral / span)`.
//! - No observations returns `None`. A span of 0 returns the latest price.

/// Maximum observations retained per token. Older ones are dropped.
pub const MAX_OBSERVATIONS: usize = 64;

/// One price observation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Observation {
    /// Block timestamp in milliseconds.
    pub ts_ms: u64,
    /// Price, arbitrary fixed point (mock convention: USD with 8 decimals).
    pub price: u128,
}

/// Appends an observation, keeping only the newest [`MAX_OBSERVATIONS`].
/// `observations` must be sorted by `ts_ms` ascending; the new one must not
/// be older than the last.
pub fn push_observation(observations: &mut Vec<Observation>, obs: Observation) {
    if let Some(last) = observations.last() {
        assert!(obs.ts_ms >= last.ts_ms, "observation older than the latest one");
    }
    observations.push(obs);
    if observations.len() > MAX_OBSERVATIONS {
        let excess = observations.len() - MAX_OBSERVATIONS;
        observations.drain(..excess);
    }
}

/// Time-weighted average price over the trailing `window_ms` ending at `now_ms`.
///
/// `observations` must be sorted by `ts_ms` ascending (as maintained by
/// [`push_observation`]). Returns `None` when there are no observations.
pub fn twap(observations: &[Observation], now_ms: u64, window_ms: u64) -> Option<u128> {
    let first = observations.first()?;
    let latest = observations.last()?;

    // Integration interval [start, now]. Never look before the first
    // observation: before it there is no price.
    let start = now_ms.saturating_sub(window_ms).max(first.ts_ms);
    // Observations stamped in the future relative to `now` (should not happen
    // on-chain, but be total) are ignored by clamping the interval.
    let end = now_ms.max(start);
    let span = end - start;
    if span == 0 {
        return Some(latest.price);
    }

    // Piecewise-constant integral: observation i holds on [ts_i, ts_{i+1}),
    // the last one holds until `end`.
    let mut integral: u128 = 0;
    for (i, obs) in observations.iter().enumerate() {
        let seg_start = obs.ts_ms.max(start);
        let seg_end = match observations.get(i + 1) {
            Some(next) => next.ts_ms.min(end),
            None => end,
        };
        if seg_end <= seg_start {
            continue;
        }
        let weight = (seg_end - seg_start) as u128;
        integral = integral
            .checked_add(
                obs.price
                    .checked_mul(weight)
                    .expect("twap integral overflow"),
            )
            .expect("twap integral overflow");
    }

    Some(integral / span as u128)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obs(ts_ms: u64, price: u128) -> Observation {
        Observation { ts_ms, price }
    }

    #[test]
    fn no_observations_is_none() {
        assert_eq!(twap(&[], 1_000, 1_000), None);
    }

    #[test]
    fn zero_span_returns_latest_price() {
        // now == first observation: span is 0.
        let o = [obs(1_000, 7)];
        assert_eq!(twap(&o, 1_000, 60_000), Some(7));
        // window of zero: span is 0 even with history.
        let o = [obs(0, 5), obs(500, 9)];
        assert_eq!(twap(&o, 1_000, 0), Some(9));
    }

    #[test]
    fn single_observation_is_constant() {
        let o = [obs(0, 100)];
        assert_eq!(twap(&o, 10_000, 1_000), Some(100));
        assert_eq!(twap(&o, 10_000, 1_000_000), Some(100));
    }

    #[test]
    fn two_observations_full_window() {
        // 100 for 500ms, then 200 for 500ms.
        let o = [obs(0, 100), obs(500, 200)];
        assert_eq!(twap(&o, 1_000, 1_000), Some(150));
    }

    #[test]
    fn window_start_clamps_to_first_observation() {
        // Window reaches back before the first observation; integrate from it.
        let o = [obs(1_000, 100), obs(1_500, 200)];
        // start = max(2000 - 100000, 1000) = 1000, span = 1000.
        assert_eq!(twap(&o, 2_000, 100_000), Some(150));
    }

    #[test]
    fn window_start_between_observations_uses_price_in_effect() {
        let o = [obs(0, 100), obs(500, 200)];
        // start = 250: [250,500) @100 = 25000, [500,750) @200 = 50000 => 75000/500.
        assert_eq!(twap(&o, 750, 500), Some(150));
        // start = 600: entirely after the jump.
        assert_eq!(twap(&o, 1_100, 500), Some(200));
    }

    #[test]
    fn jump_only_reaches_new_price_after_full_window() {
        let window = 60_000;
        let o = [obs(0, 100), obs(100_000, 300)];
        // Right at the jump: still the old price.
        assert_eq!(twap(&o, 100_000, window), Some(100));
        // Half a window later: halfway.
        assert_eq!(twap(&o, 130_000, window), Some(200));
        // A full window later: new price.
        assert_eq!(twap(&o, 160_000, window), Some(300));
        assert_eq!(twap(&o, 999_000, window), Some(300));
    }

    #[test]
    fn result_is_floored() {
        // 1 for 1ms, 2 for 2ms: (1 + 4) / 3 = 1.66 -> 1.
        let o = [obs(0, 1), obs(1, 2)];
        assert_eq!(twap(&o, 3, 3), Some(1));
    }

    #[test]
    fn many_observations() {
        let o: Vec<Observation> = (0..10).map(|i| obs(i * 100, (i + 1) as u128 * 10)).collect();
        // Each price holds 100ms, last one holds [900, 1000). Mean of 10..100 = 55.
        assert_eq!(twap(&o, 1_000, 1_000), Some(55));
        // Last 250ms: [750,800)@80, [800,900)@90, [900,1000)@100
        // = 4000 + 9000 + 10000 = 23000 / 250 = 92.
        assert_eq!(twap(&o, 1_000, 250), Some(92));
    }

    #[test]
    fn duplicate_timestamps_are_zero_width() {
        let o = [obs(0, 100), obs(500, 999), obs(500, 200)];
        assert_eq!(twap(&o, 1_000, 1_000), Some(150));
    }

    #[test]
    fn push_keeps_newest_64() {
        let mut v = Vec::new();
        for i in 0..100u64 {
            push_observation(&mut v, obs(i, i as u128));
        }
        assert_eq!(v.len(), MAX_OBSERVATIONS);
        assert_eq!(v.first().unwrap().ts_ms, 36);
        assert_eq!(v.last().unwrap().ts_ms, 99);
    }

    #[test]
    #[should_panic(expected = "older than the latest")]
    fn push_rejects_out_of_order() {
        let mut v = vec![obs(10, 1)];
        push_observation(&mut v, obs(5, 1));
    }
}
