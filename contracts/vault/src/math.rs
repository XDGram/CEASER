/// floor(a * b / c) without intermediate overflow. Panics if the result exceeds u128.
pub fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    assert!(c > 0, "Division by zero");
    if let Some(p) = a.checked_mul(b) {
        return p / c;
    }
    let (hi, lo) = full_mul(a, b);
    assert!(hi < c, "mul_div overflow");
    let mut rem = hi;
    let mut q: u128 = 0;
    for i in (0..128).rev() {
        let carry = rem >> 127;
        rem = (rem << 1) | ((lo >> i) & 1);
        q <<= 1;
        if carry == 1 || rem >= c {
            rem = rem.wrapping_sub(c);
            q |= 1;
        }
    }
    q
}

fn full_mul(a: u128, b: u128) -> (u128, u128) {
    const M: u128 = u64::MAX as u128;
    let (a1, a0) = (a >> 64, a & M);
    let (b1, b0) = (b >> 64, b & M);
    let (p00, p01, p10, p11) = (a0 * b0, a0 * b1, a1 * b0, a1 * b1);
    let mid = (p00 >> 64) + (p01 & M) + (p10 & M);
    let lo = (p00 & M) | (mid << 64);
    let hi = p11 + (p01 >> 64) + (p10 >> 64) + (mid >> 64);
    (hi, lo)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_values() {
        assert_eq!(mul_div(10, 20, 4), 50);
        assert_eq!(mul_div(7, 3, 2), 10);
        assert_eq!(mul_div(0, 5, 3), 0);
    }

    #[test]
    fn wide_values() {
        let big = u128::MAX / 3;
        assert_eq!(mul_div(big, 9, 9), big);
        assert_eq!(mul_div(u128::MAX, u128::MAX, u128::MAX), u128::MAX);
        assert_eq!(mul_div(1 << 100, 1 << 100, 1 << 90), 1 << 110);
        let (a, b, c) = (10u128.pow(30), 10u128.pow(29), 10u128.pow(31));
        assert_eq!(mul_div(a, b, c), 10u128.pow(28));
        assert_eq!(mul_div(a + 7, b, b), a + 7);
    }

    #[test]
    #[should_panic(expected = "mul_div overflow")]
    fn overflow_panics() {
        mul_div(u128::MAX, u128::MAX, 1);
    }
}
