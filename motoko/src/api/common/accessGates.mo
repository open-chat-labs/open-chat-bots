import B "base";

module {
    public type AccessGateConfig = {
        gate : AccessGate;
        expiry : ?B.Milliseconds;
    };

    public type AccessGateNonComposite = {
        #DiamondMember;
        #LifetimeDiamondMember;
        #UniquePerson;
        #VerifiedCredential : VerifiedCredentialGate;
        #SnsNeuron : SnsNeuronGate;
        #Payment : PaymentGate;
        #TokenBalance : TokenBalanceGate;
        #Locked;
        #ReferredByMember;
    };

    public type AccessGate = AccessGateNonComposite or {
        #Composite : CompositeGate;
    };

    public type CompositeGate = {
        inner : [AccessGateNonComposite];
        and_ : Bool;
    };

    public type TokenBalanceGate = {
        ledger_canister_id : Principal;
        min_balance : Nat;
    };

    public type PaymentGate = {
        ledger_canister_id : Principal;
        amount : Nat;
        fee : Nat;
    };

    public type SnsNeuronGate = {
        governance_canister_id : Principal;
        min_stake_e8s : ?Nat64;
        min_dissolve_delay : ?B.Milliseconds;
    };

    public type VerifiedCredentialGate = {
        issuer_canister_id : Principal;
        issuer_origin : Text;
        credential_type : Text;
        credential_name : Text;
        credential_arguments : [(Text, VerifiedCredentialArgumentValue)];
    };

    public type VerifiedCredentialArgumentValue = {
        #String : Text;
        #Int : Int32;
    };
};
