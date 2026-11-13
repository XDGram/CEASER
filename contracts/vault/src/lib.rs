use near_sdk::{near, AccountId, PanicOnDefault};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    owner_id: AccountId,
    oracle_id: AccountId,
}

#[near]
impl Vault {
    #[init]
    pub fn new(owner_id: AccountId, oracle_id: AccountId) -> Self {
        Self { owner_id, oracle_id }
    }

    pub fn get_oracle(&self) -> AccountId {
        self.oracle_id.clone()
    }
}
