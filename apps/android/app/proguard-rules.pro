# Retrofit, kotlinx.serialization, and Hilt include their own consumer rules.
# Preserve generic signatures and runtime annotations used by Retrofit.
-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations
