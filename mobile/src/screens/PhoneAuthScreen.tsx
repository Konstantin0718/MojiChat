import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

interface Props {
  navigation: any;
}

export const PhoneAuthScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const { login } = useAuth();
  const [step, setStep] = useState<'phone' | 'code' | 'name'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('+359');
  const [verificationCode, setVerificationCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  
  // Code input refs for OTP-style input
  const codeInputs = useRef<(TextInput | null)[]>([]);

  const handleSendCode = async () => {
    if (phoneNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      const result = await api.sendPhoneCode(phoneNumber);
      // In dev mode, show the code
      if (result.verification_code) {
        Alert.alert('Dev Mode', `Verification code: ${result.verification_code}`);
      }
      setStep('code');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const result = await api.verifyPhoneCode(phoneNumber, verificationCode, name || undefined);
      
      if (result.is_new_user && !name) {
        setIsNewUser(true);
        setStep('name');
        setLoading(false);
        return;
      }
      
      // Login successful
      login(result.token, {
        user_id: result.user_id,
        name: result.name,
        email: result.email,
        phone_number: result.phone_number,
        picture: result.picture,
      } as any);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleSetName = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    
    // Re-verify with name
    await handleVerifyCode();
  };

  const handleCodeChange = (text: string, index: number) => {
    const newCode = verificationCode.split('');
    newCode[index] = text;
    setVerificationCode(newCode.join(''));
    
    // Auto-focus next input
    if (text && index < 5) {
      codeInputs.current[index + 1]?.focus();
    }
  };

  const styles = createStyles(colors);

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => step === 'phone' ? navigation.goBack() : setStep('phone')} 
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Phone Login</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        {step === 'phone' && (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="phone-portrait-outline" size={64} color={colors.primary} />
            </View>
            
            <Text style={styles.title}>Enter Phone Number</Text>
            <Text style={styles.subtitle}>
              We'll send you a verification code via SMS
            </Text>

            <View style={styles.phoneInputContainer}>
              <View style={styles.countryCode}>
                <Text style={styles.countryCodeText}>🇧🇬</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="+359 888 123 456"
                placeholderTextColor={colors.textSecondary}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                maxLength={15}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send Code</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {step === 'code' && (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="chatbox-outline" size={64} color={colors.primary} />
            </View>
            
            <Text style={styles.title}>Enter Code</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to{'\n'}{phoneNumber}
            </Text>

            <View style={styles.codeContainer}>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <TextInput
                  key={index}
                  ref={(ref) => { codeInputs.current[index] = ref; }}
                  style={styles.codeInput}
                  value={verificationCode[index] || ''}
                  onChangeText={(text) => handleCodeChange(text, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerifyCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={handleSendCode}
              disabled={loading}
            >
              <Text style={styles.linkText}>Resend Code</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'name' && (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="person-outline" size={64} color={colors.primary} />
            </View>
            
            <Text style={styles.title}>What's your name?</Text>
            <Text style={styles.subtitle}>
              This is how others will see you in chats
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={22} color={colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSetName}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 50,
      paddingBottom: 12,
      paddingHorizontal: 8,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    content: {
      flex: 1,
      padding: 24,
      alignItems: 'center',
    },
    iconContainer: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 32,
    },
    phoneInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      marginBottom: 24,
      gap: 12,
    },
    countryCode: {
      width: 60,
      height: 56,
      backgroundColor: colors.card,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    countryCodeText: {
      fontSize: 24,
    },
    phoneInput: {
      flex: 1,
      height: 56,
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingHorizontal: 16,
      fontSize: 18,
      color: colors.text,
      letterSpacing: 1,
    },
    codeContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 32,
    },
    codeInput: {
      width: 48,
      height: 56,
      backgroundColor: colors.card,
      borderRadius: 12,
      textAlign: 'center',
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingHorizontal: 16,
      height: 56,
      width: '100%',
      marginBottom: 24,
    },
    input: {
      flex: 1,
      marginLeft: 12,
      fontSize: 16,
      color: colors.text,
    },
    button: {
      width: '100%',
      height: 56,
      backgroundColor: colors.primary,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '600',
    },
    linkButton: {
      marginTop: 24,
      padding: 12,
    },
    linkText: {
      color: colors.primary,
      fontSize: 16,
    },
  });
