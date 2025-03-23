use candid::CandidType;
use ic_agent::Agent;
use oc_bots_sdk::types::CanisterId;
use serde::Serialize;
use std::sync::LazyLock;

static LLM_CANISTER_ID: LazyLock<CanisterId> =
    LazyLock::new(|| CanisterId::from_text("w36hm-eqaaa-aaaal-qr76a-cai").unwrap());

const LLAMA_3_1_MODEL: &str = "llama3.1:8b";

pub struct LlmCanisterAgent {
    agent: Agent,
}

impl LlmCanisterAgent {
    pub fn new(agent: Agent) -> LlmCanisterAgent {
        LlmCanisterAgent { agent }
    }

    pub async fn prompt(&self, message: String) -> Result<String, String> {
        // 日本語の指示文を追加
        let modified_message = format!(
            r#"
あなたは日本に関する情報を提供する専門家です。日本の文化、観光、料理、言語などについて詳しく答えてください。常に日本語で回答してください。

USER: {}
ASSISTANT:"#,
            message
        );

        let args = ChatRequest {
            model: LLAMA_3_1_MODEL,
            messages: vec![ChatMessage {
                role: Role::User,
                content: modified_message, // 修正したメッセージを使用
            }],
        };

        match self
            .agent
            .update(&LLM_CANISTER_ID, "v0_chat")
            .with_arg(candid::encode_one(&args).unwrap())
            .call_and_wait()
            .await
        {
            Ok(response) => Ok(candid::decode_one(&response).unwrap()),
            Err(error) => Err(format!("Failed to call the LLM canister: {error}")),
        }
    }
}

#[derive(CandidType, Serialize)]
enum Role {
    #[serde(rename = "user")]
    User,
}

#[derive(CandidType)]
struct ChatMessage {
    role: Role,
    content: String,
}

#[derive(CandidType)]
struct ChatRequest {
    model: &'static str,
    messages: Vec<ChatMessage>,
}
