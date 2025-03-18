use crate::types::{ActionScope, BotApiKeyContext, BotPermissions, Chat};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default)]
pub struct ApiKeyRegistry {
    api_keys: HashMap<ActionScope, ApiKeyRecord>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ApiKeyRecord {
    pub token: String,
    pub granted_permissions: BotPermissions,
}

impl ApiKeyRecord {
    pub fn to_context(&self) -> BotApiKeyContext {
        BotApiKeyContext::parse_api_key(self.token.clone()).unwrap()
    }
}

impl ApiKeyRegistry {
    pub fn insert(&mut self, api_key: String) -> Result<(), String> {
        let cxt = BotApiKeyContext::parse_api_key(api_key).map_err(|err| format!("{err:?}"))?;

        // Overwrite any existing api key at the same scope
        self.api_keys.insert(
            cxt.scope,
            ApiKeyRecord {
                granted_permissions: cxt.granted_permissions,
                token: cxt.token.into(),
            },
        );

        Ok(())
    }

    pub fn get(&self, scope: &ActionScope) -> Option<&ApiKeyRecord> {
        self.api_keys.get(scope)
    }

    pub fn get_key_with_required_permissions(
        &self,
        scope: &ActionScope,
        required_permissions: &BotPermissions,
    ) -> Option<&ApiKeyRecord> {
        if let Some(record) = self.api_keys.get(scope) {
            if required_permissions.is_subset(&record.granted_permissions) {
                return Some(record);
            }
        }

        // If an API Key with the required permissions cannot be found at the
        // channel scope then check the community scope
        if let ActionScope::Chat(Chat::Channel(community_id, _)) = &scope {
            let community_scope = ActionScope::Community(*community_id);
            if let Some(record) = self.api_keys.get(&community_scope) {
                if required_permissions.is_subset(&record.granted_permissions) {
                    return Some(record);
                }
            }
        }

        None
    }

    pub fn remove(&mut self, scope: &ActionScope) {
        self.api_keys.remove(scope);
    }

    pub fn count(&self) -> usize {
        self.api_keys.len()
    }
}
