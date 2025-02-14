// module.exports.hello = () => 'world';

#include <node.h>
#include <zstd.h>
#include "common.h"

namespace demo {

using v8::ArrayBuffer;
using v8::BackingStore;
using v8::Exception;
using v8::External;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Number;
using v8::Object;
using v8::String;
using v8::Uint8Array;
using v8::Value;

// TODO: do we need to free? Expected lifetime is the lifetime of the program
auto cctx = ZSTD_createCCtx();
auto dctx = ZSTD_createDCtx();

void Compress(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  if (args.Length() > 2 || args.Length() < 1) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(isolate, "Wrong number of arguments").ToLocalChecked()
    ));
    return;
  }

  if (args.Length() >= 1 && !args[0]->IsUint8Array()) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(
        isolate, "First arg must be Uint8Array: data to compress"
      ).ToLocalChecked()
    ));
    return;
  }

  if (args.Length() >= 2 && !args[1]->IsNumber() && !args[1]->IsExternal()) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(
        isolate, "Second arg must be either: compression level or dict"
      ).ToLocalChecked()
    ));
    return;
  }

  auto input = args[0].As<Uint8Array>();
  size_t inSize = input->Length();
  auto inBuff = input->Buffer()->GetBackingStore()->Data();
  size_t const outSize = ZSTD_compressBound(inSize);
  auto backingStore = ArrayBuffer::NewBackingStore(isolate, outSize);

  size_t outActualSize;
  if (args.Length() >= 2 && args[1]->IsExternal()) {
    outActualSize = ZSTD_compress_usingCDict(
      cctx,
      backingStore->Data(),
      outSize,
      (uint8_t *) inBuff + input->ByteOffset(),
      inSize,
      (ZSTD_CDict *) args[1].As<External>()->Value()
    );
  } else {
    int compressionLevel = 1;
    if (args.Length() >= 2 && args[1]->IsNumber()) {
      compressionLevel = args[1].As<Number>()->Value();
    }

    outActualSize = ZSTD_compressCCtx(
      cctx,
      backingStore->Data(),
      outSize,
      (uint8_t *) inBuff + input->ByteOffset(),
      inSize,
      compressionLevel
    );
  }
  CHECK_ZSTD(outActualSize);

  args.GetReturnValue().Set(Uint8Array::New(
    ArrayBuffer::New(isolate, std::move(backingStore)),
    0,
    outActualSize
  ));
}

void Decompress(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  if (args.Length() > 2) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(isolate, "Wrong number of arguments").ToLocalChecked()
    ));
    return;
  }

  if (!args[0]->IsUint8Array()) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(
        isolate, "First arg must be Uint8Array"
      ).ToLocalChecked()
    ));
    return;
  }

  if (args.Length() >= 2 && !args[1]->IsExternal()) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(
        isolate, "Second arg is optional dict to use"
      ).ToLocalChecked()
    ));
    return;
  }

  auto input = args[0].As<Uint8Array>();
  size_t inSize = input->Length();
  auto inBuff = input->Buffer()->GetBackingStore()->Data();
  size_t const outSize = ZSTD_getFrameContentSize(
    (uint8_t *) inBuff + input->ByteOffset(),
    inSize
  );
  CHECK_ZSTD(outSize);
  if (outSize > 1024 * 1024 * 32) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(
        isolate, "You tried to decompress a large chunk. Streaming mode is not implemented yet"
      ).ToLocalChecked()
    ));
    return;
  }
  auto backingStore = ArrayBuffer::NewBackingStore(isolate, outSize);

  size_t outActualSize;
  if (args.Length() == 2) {
    outActualSize = ZSTD_decompress_usingDDict(
      dctx,
      backingStore->Data(),
      outSize,
      (uint8_t *) inBuff + input->ByteOffset(),
      inSize,
      (ZSTD_DDict *) args[1].As<External>()->Value()
    );
  } else {
    outActualSize = ZSTD_decompressDCtx(
      dctx,
      backingStore->Data(),
      outSize,
      (uint8_t *) inBuff + input->ByteOffset(),
      inSize
    );
  }
  CHECK_ZSTD(outActualSize);

  args.GetReturnValue().Set(Uint8Array::New(
    ArrayBuffer::New(isolate, std::move(backingStore)),
    0,
    outActualSize
  ));
}

// TODO: no methods to free yet.
void CreateCDict(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  if (args.Length() > 2 || args.Length() < 1) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(isolate, "Wrong number of arguments").ToLocalChecked()
    ));
    return;
  }

  if (args.Length() >= 1 && !args[0]->IsUint8Array()) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(
        isolate, "First arg must be Uint8Array: dictionary"
      ).ToLocalChecked()
    ));
    return;
  }

  if (args.Length() >= 2 && !args[1]->IsNumber()) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(
        isolate, "Second arg must be number: compression level"
      ).ToLocalChecked()
    ));
    return;
  }

  int compressionLevel = 1;
  if (args[1]->IsNumber()) {
    compressionLevel = args[1].As<Number>()->Value();
  }


  auto input = args[0].As<Uint8Array>();
  size_t inSize = input->Length();
  auto inBuff = input->Buffer()->GetBackingStore()->Data();

  auto dict = ZSTD_createCDict(
    (uint8_t *) inBuff + input->ByteOffset(), inSize, compressionLevel
  );

  args.GetReturnValue().Set(External::New(isolate, dict));
}

void CreateDDict(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  if (args.Length() != 1) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(isolate, "Wrong number of arguments").ToLocalChecked()
    ));
    return;
  }

  if (!args[0]->IsUint8Array()) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(
        isolate, "First arg must be Uint8Array"
      ).ToLocalChecked()
    ));
    return;
  }

  auto input = args[0].As<Uint8Array>();
  size_t inSize = input->Length();
  auto inBuff = input->Buffer()->GetBackingStore()->Data();

  auto dict = ZSTD_createDDict(
    (uint8_t *) inBuff + input->ByteOffset(), inSize
  );

  args.GetReturnValue().Set(External::New(isolate, dict));
}

void Initialize(Local<Object> exports) {
  NODE_SET_METHOD(exports, "compress", Compress);
  NODE_SET_METHOD(exports, "decompress", Decompress);
  NODE_SET_METHOD(exports, "createCDict", CreateCDict);
  NODE_SET_METHOD(exports, "createDDict", CreateDDict);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)

}  // namespace demo
