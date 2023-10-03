import * as anchor from "@coral-xyz/anchor";
import { TestClient } from "./test_client";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect, assert } from "chai";
import * as ethutil from "ethereumjs-util";
import BN from "bn.js";
import * as spl from "@solana/spl-token";

describe("token_messenger_minter", () => {
  let tc = new TestClient();

  let tokenMessengerExpected;
  let remoteTokenMessengerExpected;
  let tokenMinterExpected;
  let localTokenExpected;
  let tokenPairExpected;

  let messageBodyVersion = 0;
  let remoteDomain = 123;
  let remoteTokenMessenger = tc.findProgramAddress("remote_token_messenger", [
    remoteDomain.toString(),
  ]).publicKey;
  let remoteToken = new PublicKey(
    "7rSe3oH1TbF92kxTv9UFETJ89gy7HmxTss9gN4Wp8KnF"
  );
  let mintRecipient = new PublicKey(
    "4k7otob3oN7BWRBW3JAkHXuWEjUhSbJHgBByZD6BE5Si"
  );
  let destinationCaller = new PublicKey(
    "DebXB8PvwxzhanvMoDkS86aajBNnCEF3s2ieT5cFfJNh"
  );
  let messageNonce = BigInt(1098);
  let messageAmount = BigInt(200000000);
  let messageSourceDomain = 0;

  let message = tc.hexToBytes(
    "000000000000000000000003000000000000044a000000000000000000000000bd3fa81b58ba92a82136038b25adec7066af315500000000000000000000000019330d10d9cc8751218eaf51e8885d058642e08a0000000000000000000000001b067f9fdff92cc254afcf7f941617588116bd8100000000000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000fb2bfc368a7edfd51aa2cbec513ad50edea74e84000000000000000000000000000000000000000000000000000000000bebc200000000000000000000000000fb2bfc368a7edfd51aa2cbec513ad50edea74e84"
  );
  let attester1 = new PublicKey(
    tc.hexToBytes("E2fEfe09E74b921CbbFF229E7cD40009231501CA")
  );
  let attester2 = new PublicKey(
    tc.hexToBytes("b0Ea8E1bE37F346C7EA7ec708834D0db18A17361")
  );
  let attestation = tc.hexToBytes(
    "3a5deeba6e3a82a67a832114c8a588ab972445ed9c87bb22fd4a5792fd68ae102440cf49e09597cf1b4c48bdef8ad1f8e13929712ff9a84b31cd76971413ae2f1c2a23eed2170f3819542d465f33e0b1bdc925bc3fa8f4e3e7d0b6fc461528ad015513c8aaf8d5398c49eeee6b4160bd51f3e5cd056bef4e6fd222da2e20b7e5b01b"
  );

  it("initialize", async () => {
    await tc.initFixture();
    await tc.initialize(tc.tokenController.publicKey, messageBodyVersion);

    let err = await tc.ensureFails(
      tc.initialize(tc.tokenController.publicKey, messageBodyVersion)
    );
    assert(err.logs[3].includes("already in use"));

    tokenMessengerExpected = {
      owner: tc.provider.wallet.publicKey,
      pendingOwner: PublicKey.default,
      localMessageTransmitter: tc.messageTransmitterProgram.programId,
      messageBodyVersion,
      authorityBump: tc.authorityPda.bump,
    };
    let tokenMessenger = await tc.program.account.tokenMessenger.fetch(
      tc.tokenMessenger.publicKey
    );
    expect(JSON.stringify(tokenMessenger)).to.equal(
      JSON.stringify(tokenMessengerExpected)
    );

    let tokenMinter = await tc.program.account.tokenMinter.fetch(
      tc.tokenMinter.publicKey
    );
    tokenMinterExpected = {
      tokenController: tc.tokenController.publicKey,
      pauser: tc.provider.wallet.publicKey,
      paused: false,
      bump: tokenMinter.bump,
    };
    expect(JSON.stringify(tokenMinter)).to.equal(
      JSON.stringify(tokenMinterExpected)
    );
  });

  it("transferOwnership", async () => {
    let listener = null;
    let [event, _slot] = await new Promise((resolve, _reject) => {
      listener = tc.program.addEventListener(
        "OwnershipTransferStarted",
        (event, slot) => {
          resolve([event, slot]);
        }
      );
      tc.transferOwnership(tc.owner.publicKey);
    });
    await tc.program.removeEventListener(listener);

    tokenMessengerExpected.pendingOwner = tc.owner.publicKey;

    let tokenMessenger = await tc.program.account.tokenMessenger.fetch(
      tc.tokenMessenger.publicKey
    );
    expect(JSON.stringify(tokenMessenger)).to.equal(
      JSON.stringify(tokenMessengerExpected)
    );

    let eventExpected = {
      previousOwner: tc.provider.wallet.publicKey,
      newOwner: tc.owner.publicKey,
    };
    expect(JSON.stringify(event)).to.equal(JSON.stringify(eventExpected));
  });

  it("acceptOwnership", async () => {
    await tc.acceptOwnership(tc.owner);

    tokenMessengerExpected.owner = tc.owner.publicKey;
    tokenMessengerExpected.pendingOwner = PublicKey.default;

    let tokenMessenger = await tc.program.account.tokenMessenger.fetch(
      tc.tokenMessenger.publicKey
    );
    expect(JSON.stringify(tokenMessenger)).to.equal(
      JSON.stringify(tokenMessengerExpected)
    );
  });

  it("addRemoteTokenMessenger", async () => {
    await tc.addRemoteTokenMessenger(remoteDomain, remoteTokenMessenger);

    remoteTokenMessengerExpected = {
      domain: remoteDomain,
      tokenMessenger: remoteTokenMessenger,
    };

    let remoteTokenMessengerState =
      await tc.program.account.remoteTokenMessenger.fetch(remoteTokenMessenger);
    expect(JSON.stringify(remoteTokenMessengerState)).to.equal(
      JSON.stringify(remoteTokenMessengerExpected)
    );
  });

  it("removeRemoteTokenMessenger", async () => {
    await tc.removeRemoteTokenMessenger(remoteTokenMessenger);
    await tc.ensureFails(
      tc.program.account.remoteTokenMessenger.fetch(remoteTokenMessenger)
    );

    await tc.addRemoteTokenMessenger(remoteDomain, remoteTokenMessenger);
  });

  it("updatePauser", async () => {
    await tc.updatePauser(tc.pauser.publicKey);

    tokenMinterExpected.pauser = tc.pauser.publicKey;

    let tokenMinter = await tc.program.account.tokenMinter.fetch(
      tc.tokenMinter.publicKey
    );
    expect(JSON.stringify(tokenMinter)).to.equal(
      JSON.stringify(tokenMinterExpected)
    );
  });

  it("setTokenController", async () => {
    await tc.setTokenController(tc.tokenController.publicKey);

    tokenMinterExpected.tokenController = tc.tokenController.publicKey;

    let tokenMinter = await tc.program.account.tokenMinter.fetch(
      tc.tokenMinter.publicKey
    );
    expect(JSON.stringify(tokenMinter)).to.equal(
      JSON.stringify(tokenMinterExpected)
    );
  });

  it("pause", async () => {
    await tc.pause();

    tokenMinterExpected.paused = true;

    let tokenMinter = await tc.program.account.tokenMinter.fetch(
      tc.tokenMinter.publicKey
    );
    expect(JSON.stringify(tokenMinter)).to.equal(
      JSON.stringify(tokenMinterExpected)
    );
  });

  it("unpause", async () => {
    await tc.unpause();

    tokenMinterExpected.paused = false;

    let tokenMinter = await tc.program.account.tokenMinter.fetch(
      tc.tokenMinter.publicKey
    );
    expect(JSON.stringify(tokenMinter)).to.equal(
      JSON.stringify(tokenMinterExpected)
    );
  });

  it("addLocalToken", async () => {
    await tc.addLocalToken();

    localTokenExpected = {
      custody: tc.custodyTokenAccount.publicKey,
      mint: tc.localTokenMint.publicKey,
      burnLimitPerMessage: new BN(0),
      messagesSent: "0",
      messagesReceived: "0",
      amountSent: "0",
      amountReceived: "0",
      bump: tc.localToken.bump,
      custodyBump: tc.custodyTokenAccount.bump,
    };

    let localTokenState = await tc.program.account.localToken.fetch(
      tc.localToken.publicKey
    );

    expect(JSON.stringify(localTokenState)).to.equal(
      JSON.stringify(localTokenExpected)
    );
  });

  it("removeLocalToken", async () => {
    await tc.removeLocalToken();
    await tc.ensureFails(
      tc.program.account.localToken.fetch(tc.localToken.publicKey)
    );

    await tc.addLocalToken();
  });

  it("setMaxBurnAmountPerMessage", async () => {
    await tc.setMaxBurnAmountPerMessage(new BN(100));

    localTokenExpected.burnLimitPerMessage = new BN(100);

    let localToken = await tc.program.account.localToken.fetch(
      tc.localToken.publicKey
    );
    expect(JSON.stringify(localToken)).to.equal(
      JSON.stringify(localTokenExpected)
    );
  });

  it("linkTokenPair", async () => {
    await tc.linkTokenPair(remoteDomain, remoteToken);

    let tokenPair = tc.findProgramAddress("token_pair", [
      remoteDomain.toString(),
      remoteToken,
    ]);

    tokenPairExpected = {
      remoteDomain,
      remoteToken: remoteToken,
      localToken: tc.localToken.publicKey,
      bump: tokenPair.bump,
    };

    let tokenPairState = await tc.program.account.tokenPair.fetch(
      tokenPair.publicKey
    );

    expect(JSON.stringify(tokenPairState)).to.equal(
      JSON.stringify(tokenPairExpected)
    );
  });

  it("unlinkTokenPair", async () => {
    await tc.unlinkTokenPair(remoteDomain, remoteToken);

    let tokenPair = tc.findProgramAddress("token_pair", [
      remoteDomain.toString(),
      remoteToken,
    ]);
    await tc.ensureFails(
      tc.program.account.tokenPair.fetch(tokenPair.publicKey)
    );

    await tc.linkTokenPair(remoteDomain, remoteToken);
  });

  it("depositForBurn", async () => {
    let [event1, listener1] = tc.scheduleEvent("DepositForBurn");
    let [event2, listener2] = tc.scheduleEvent(
      "MessageSent",
      tc.messageTransmitterProgram
    );

    await tc.depositForBurn(
      new BN(20),
      remoteDomain,
      mintRecipient,
      remoteTokenMessenger
    );

    let depositForBurn = await event1;
    let depositForBurnExpected = {
      nonce: "1",
      burnToken: tc.localTokenMint.publicKey,
      amount: "20",
      depositor: tc.user.publicKey,
      mintRecipient,
      destinationDomain: remoteDomain,
      destinationTokenMessenger: remoteTokenMessenger,
      destinationCaller: PublicKey.default,
    };
    expect(JSON.stringify(depositForBurn)).to.equal(
      JSON.stringify(depositForBurnExpected)
    );

    let messageSent = await event2;
    expect(messageSent.message.length).to.equal(248);

    await tc.program.removeEventListener(listener1);
    await tc.messageTransmitterProgram.removeEventListener(listener2);
  });

  it("depositForBurnWithCaller", async () => {
    let [event1, listener1] = tc.scheduleEvent("DepositForBurn");
    let [event2, listener2] = tc.scheduleEvent(
      "MessageSent",
      tc.messageTransmitterProgram
    );

    await tc.depositForBurnWithCaller(
      new BN(20),
      remoteDomain,
      mintRecipient,
      destinationCaller,
      remoteTokenMessenger
    );

    let depositForBurn = await event1;
    let depositForBurnExpected = {
      nonce: "2",
      burnToken: tc.localTokenMint.publicKey,
      amount: "20",
      depositor: tc.user.publicKey,
      mintRecipient,
      destinationDomain: remoteDomain,
      destinationTokenMessenger: remoteTokenMessenger,
      destinationCaller,
    };
    expect(JSON.stringify(depositForBurn)).to.equal(
      JSON.stringify(depositForBurnExpected)
    );

    let messageSent = await event2;
    expect(messageSent.message.length).to.equal(248);

    await tc.program.removeEventListener(listener1);
    await tc.messageTransmitterProgram.removeEventListener(listener2);
  });

  it("replaceDepositForBurn", async () => {
    let [event1, listener1] = tc.scheduleEvent("DepositForBurn");
    let [event2, listener2] = tc.scheduleEvent(
      "MessageSent",
      tc.messageTransmitterProgram
    );

    await tc.replaceDepositForBurn(
      message,
      attestation,
      destinationCaller,
      mintRecipient
    );

    let depositForBurn = await event1;
    let depositForBurnExpected = {
      nonce: messageNonce.toString(),
      burnToken: "1111111111113EsMD5n1VA94D2fALdb1SAKLam8j",
      amount: messageAmount.toString(),
      depositor: "1111111111114VxToarANMjkwzH4g9fm2kbLkGTV",
      mintRecipient,
      destinationDomain: 3,
      destinationTokenMessenger: "111111111111MN124yndxDmRzRoeCbBed9STUos",
      destinationCaller,
    };
    expect(JSON.stringify(depositForBurn)).to.equal(
      JSON.stringify(depositForBurnExpected)
    );

    let messageSent = await event2;
    expect(messageSent.message.length).to.equal(248);

    await tc.program.removeEventListener(listener1);
    await tc.messageTransmitterProgram.removeEventListener(listener2);
  });

  it("receiveMessage", async () => {
    // change remote domain to 0 to match the message
    await tc.removeRemoteTokenMessenger(remoteTokenMessenger);

    remoteDomain = 0;
    remoteTokenMessenger = tc.findProgramAddress("remote_token_messenger", [
      remoteDomain.toString(),
    ]).publicKey;
    await tc.addRemoteTokenMessenger(remoteDomain, remoteTokenMessenger);

    // link token pair
    remoteToken = new PublicKey("1111111111113EsMD5n1VA94D2fALdb1SAKLam8j");
    await tc.linkTokenPair(remoteDomain, remoteToken);

    // fund custody
    await spl.mintToChecked(
      tc.provider.connection,
      tc.owner,
      tc.localTokenMint.publicKey,
      tc.custodyTokenAccount.publicKey,
      tc.owner,
      messageAmount,
      9
    );

    // receive message
    let [event1, listener1] = tc.scheduleEvent(
      "MessageReceived",
      tc.messageTransmitterProgram
    );
    let [event2, listener2] = tc.scheduleEvent("MintAndWithdraw");

    await tc.receiveMessage(
      remoteDomain,
      remoteToken,
      messageNonce,
      message,
      attestation,
      remoteTokenMessenger
    );

    let messageReceived = await event1;
    let messageReceivedExpected = {
      caller: tc.provider.wallet.publicKey,
      sourceDomain: messageSourceDomain,
      nonce: messageNonce.toString(),
      sender: "1111111111113dvMv4ZCzFdjMXrQ3mrKCG7cjKA4",
      messageBody: Buffer.from([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 160, 184, 105, 145, 198,
        33, 139, 54, 193, 209, 157, 74, 46, 158, 176, 206, 54, 6, 235, 72, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 251, 43, 252, 54, 138, 126, 223, 213, 26,
        162, 203, 236, 81, 58, 213, 14, 222, 167, 78, 132, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11, 235,
        194, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 251, 43, 252, 54, 138, 126,
        223, 213, 26, 162, 203, 236, 81, 58, 213, 14, 222, 167, 78, 132,
      ]),
    };
    expect(JSON.stringify(messageReceived)).to.equal(
      JSON.stringify(messageReceivedExpected)
    );

    let mintAndWithdraw = await event2;
    let mintAndWithdrawExpected = {
      mintRecipient: "1111111111114VxToarANMjkwzH4g9fm2kbLkGTV",
      amount: messageAmount.toString(),
      mintToken: tc.localTokenMint.publicKey,
    };
    expect(JSON.stringify(mintAndWithdraw)).to.equal(
      JSON.stringify(mintAndWithdrawExpected)
    );

    await tc.messageTransmitterProgram.removeEventListener(listener1);
    await tc.program.removeEventListener(listener2);

    localTokenExpected = {
      custody: tc.custodyTokenAccount.publicKey,
      mint: tc.localTokenMint.publicKey,
      burnLimitPerMessage: "100",
      messagesSent: "2",
      messagesReceived: "1",
      amountSent: "40",
      amountReceived: "200000000",
      bump: tc.localToken.bump,
      custodyBump: tc.custodyTokenAccount.bump,
    };

    let localTokenState = await tc.program.account.localToken.fetch(
      tc.localToken.publicKey
    );

    expect(JSON.stringify(localTokenState)).to.equal(
      JSON.stringify(localTokenExpected)
    );
  });

  it("endToEnd", async () => {
    // update attesters
    const privateKey1 = Keypair.generate().publicKey.toBuffer();
    const publicKey1 = ethutil.privateToAddress(privateKey1);
    const privateKey2 = Keypair.generate().publicKey.toBuffer();
    const publicKey2 = ethutil.privateToAddress(privateKey2);
    const newAttester1 = new PublicKey(publicKey1);
    const newAttester2 = new PublicKey(publicKey2);

    await tc.enableAttester(newAttester1);
    await tc.enableAttester(newAttester2);
    await tc.disableAttester(attester1);
    await tc.disableAttester(attester2);

    // deposit for burn
    let [event1, listener1] = tc.scheduleEvent("DepositForBurn");
    let [event2, listener2] = tc.scheduleEvent(
      "MessageSent",
      tc.messageTransmitterProgram
    );

    messageNonce = BigInt(3);
    const messageAmount = 20;

    await tc.depositForBurnWithCaller(
      new BN(messageAmount),
      remoteDomain,
      mintRecipient,
      destinationCaller,
      remoteTokenMessenger
    );

    // validate deposit for burn
    let depositForBurn = await event1;
    let depositForBurnExpected = {
      nonce: messageNonce.toString(),
      burnToken: tc.localTokenMint.publicKey,
      amount: messageAmount.toString(),
      depositor: tc.user.publicKey,
      mintRecipient,
      destinationDomain: remoteDomain,
      destinationTokenMessenger: remoteTokenMessenger,
      destinationCaller,
    };
    expect(JSON.stringify(depositForBurn)).to.equal(
      JSON.stringify(depositForBurnExpected)
    );

    let messageSent = await event2;
    expect(messageSent.message.length).to.equal(248);
    const messageBytes = messageSent.message;

    // sign the message
    const messageHash = ethutil.keccak256(messageBytes);
    const signedMessage1 = ethutil.ecsign(messageHash, privateKey1);
    const signedMessageBytes1 = tc.hexToBytes(
      ethutil
        .toRpcSig(signedMessage1.v, signedMessage1.r, signedMessage1.s)
        .slice(2)
    );

    const signedMessage2 = ethutil.ecsign(messageHash, privateKey2);
    const signedMessageBytes2 = tc.hexToBytes(
      ethutil
        .toRpcSig(signedMessage2.v, signedMessage2.r, signedMessage2.s)
        .slice(2)
    );

    let combinedSignedMessageBytes;
    let flip = false;
    for (let i = 0; i < Math.min(publicKey1.length, publicKey2.length); ++i) {
      if (publicKey2[i] < publicKey1[i]) {
        flip = true;
        break;
      } else if (publicKey2[i] > publicKey1[i]) {
        break;
      }
    }
    if (flip) {
      combinedSignedMessageBytes =
        signedMessageBytes2.concat(signedMessageBytes1);
    } else {
      combinedSignedMessageBytes =
        signedMessageBytes1.concat(signedMessageBytes2);
    }

    await tc.program.removeEventListener(listener1);
    await tc.messageTransmitterProgram.removeEventListener(listener2);

    // fund custody
    await tc.linkTokenPair(remoteDomain, tc.localTokenMint.publicKey);
    await spl.mintToChecked(
      tc.provider.connection,
      tc.owner,
      tc.localTokenMint.publicKey,
      tc.custodyTokenAccount.publicKey,
      tc.owner,
      messageAmount,
      9
    );

    // receive message
    [event1, listener1] = tc.scheduleEvent(
      "MessageReceived",
      tc.messageTransmitterProgram
    );
    [event2, listener2] = tc.scheduleEvent("MintAndWithdraw");

    await tc.receiveMessage(
      remoteDomain,
      tc.localTokenMint.publicKey,
      messageNonce,
      messageBytes,
      combinedSignedMessageBytes,
      remoteTokenMessenger
    );

    // validate received message
    let messageReceived = await event1;
    let messageReceivedExpected = {
      caller: tc.provider.wallet.publicKey,
      sourceDomain: remoteDomain,
      nonce: messageNonce.toString(),
      sender: tc.program.programId,
      messageBody: messageReceived.messageBody,
    };
    expect(JSON.stringify(messageReceived)).to.equal(
      JSON.stringify(messageReceivedExpected)
    );

    let mintAndWithdraw = await event2;
    let mintAndWithdrawExpected = {
      mintRecipient,
      amount: messageAmount.toString(),
      mintToken: tc.localTokenMint.publicKey,
    };
    expect(JSON.stringify(mintAndWithdraw)).to.equal(
      JSON.stringify(mintAndWithdrawExpected)
    );

    await tc.messageTransmitterProgram.removeEventListener(listener1);
    await tc.program.removeEventListener(listener2);

    localTokenExpected = {
      custody: tc.custodyTokenAccount.publicKey,
      mint: tc.localTokenMint.publicKey,
      burnLimitPerMessage: "100",
      messagesSent: "3",
      messagesReceived: "2",
      amountSent: "60",
      amountReceived: "200000020",
      bump: tc.localToken.bump,
      custodyBump: tc.custodyTokenAccount.bump,
    };

    let localTokenState = await tc.program.account.localToken.fetch(
      tc.localToken.publicKey
    );

    expect(JSON.stringify(localTokenState)).to.equal(
      JSON.stringify(localTokenExpected)
    );
  });
});